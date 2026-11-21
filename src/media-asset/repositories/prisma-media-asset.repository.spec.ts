import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { MediaOwnerNotFoundError, VideoAlreadyExistsError } from '../ports/media-asset.repository.js';
import { PrismaMediaAssetRepository } from './prisma-media-asset.repository.js';

function setup() {
  const mediaAsset = { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), delete: vi.fn() };
  return { mediaAsset, repository: new PrismaMediaAssetRepository({ mediaAsset } as unknown as PrismaService) };
}
const input = {
  id: 'media', itemId: 'item', kind: 'PHOTO' as const, storageKey: 'items/item/photo',
  contentType: 'image/png', sizeBytes: 100, position: 2, uploadedBy: 'staff',
};

describe('PrismaMediaAssetRepository', () => {
  it.each(['PHOTO', 'VIDEO'] as const)('reserves the unique video slot only for video: %s', async (kind) => {
    const { mediaAsset, repository } = setup();
    mediaAsset.create.mockImplementation(async ({ data }) => data);
    expect(await repository.attach({ ...input, kind })).toMatchObject({
      id: 'media', itemId: 'item', videoSlot: kind === 'VIDEO' ? 'item' : null,
    });
  });

  it.each([
    ['P2002', VideoAlreadyExistsError], ['P2003', MediaOwnerNotFoundError],
  ] as const)('maps integrity error %s into a domain error carrying its owner', async (code, type) => {
    const { mediaAsset, repository } = setup();
    mediaAsset.create.mockRejectedValue({ code });
    const result = repository.attach(input);
    await expect(result).rejects.toBeInstanceOf(type);
    await expect(result).rejects.toMatchObject({ itemId: 'item' });
  });

  it.each([null, 'offline', new Error('Database unavailable'), { code: 'P9999' }])('preserves unexpected attachment errors: %s', async (failure) => {
    const { mediaAsset, repository } = setup();
    mediaAsset.create.mockRejectedValue(failure);
    await expect(repository.attach(input)).rejects.toBe(failure);
  });

  it('returns ordered item media without changing the repository result', async () => {
    const { mediaAsset, repository } = setup();
    const assets = [{ ...input, position: 2 }, { ...input, id: 'other', position: 5 }];
    mediaAsset.findMany.mockResolvedValue(assets);
    expect(await repository.findByItem('item')).toBe(assets);
    expect(mediaAsset.findMany.mock.calls[0][0].orderBy).toEqual([{ kind: 'asc' }, { position: 'asc' }]);
  });

  it('does not query the database for an empty cover request', async () => {
    const { mediaAsset, repository } = setup();
    expect(await repository.findCovers([])).toEqual(new Map());
    expect(mediaAsset.findMany).not.toHaveBeenCalled();
  });

  it('indexes covers by item even when their first remaining photo is not position zero', async () => {
    const { mediaAsset, repository } = setup();
    const cover = { ...input, position: 4 };
    mediaAsset.findMany.mockResolvedValue([cover]);
    const covers = await repository.findCovers(['item', 'without-photo']);
    expect(covers.get('item')).toBe(cover);
    expect(covers.has('without-photo')).toBe(false);
    const query = mediaAsset.findMany.mock.calls[0][0];
    expect(query.where.kind).toBe('PHOTO');
    expect(query.where).not.toHaveProperty('position');
    expect(query.distinct).toEqual(['itemId']);
  });

  it('counts photos without counting an item video', async () => {
    const { mediaAsset, repository } = setup();
    mediaAsset.count.mockResolvedValue(3);
    await expect(repository.countPhotos('item')).resolves.toBe(3);
    expect(mediaAsset.count).toHaveBeenCalledWith({ where: { itemId: 'item', kind: 'PHOTO' } });
  });

  it('returns deleted metadata for storage cleanup and scopes deletion to its owner', async () => {
    const { mediaAsset, repository } = setup();
    mediaAsset.delete.mockResolvedValue(input);
    expect(await repository.detach('item', 'media')).toBe(input);
    expect(mediaAsset.delete).toHaveBeenCalledWith({ where: { id: 'media', itemId: 'item' } });
  });

  it('treats a missing or differently owned media ID as absent', async () => {
    const { mediaAsset, repository } = setup();
    mediaAsset.delete.mockRejectedValue({ code: 'P2025' });
    await expect(repository.detach('item', 'missing')).resolves.toBeNull();
  });

  it('propagates a storage metadata deletion failure', async () => {
    const { mediaAsset, repository } = setup();
    const failure = new Error('Database unavailable');
    mediaAsset.delete.mockRejectedValue(failure);
    await expect(repository.detach('item', 'media')).rejects.toBe(failure);
  });
});
