import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ItemVersionConflictError } from '../ports/item.repository.js';
import { PrismaItemRepository } from './prisma-item.repository.js';

function setup() {
  const item = {
    create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
    update: vi.fn(), deleteMany: vi.fn(),
  };
  return { item, repository: new PrismaItemRepository({ item } as unknown as PrismaService) };
}

describe('PrismaItemRepository', () => {
  it('records the registering staff member as the initial last editor and preserves clues', async () => {
    const { item, repository } = setup();
    item.create.mockImplementation(async ({ data }) => data);
    const input = { name: 'Libro', description: 'Libro encontrado', condition: 'GOOD' as const, category: 'Libros', registeredBy: 'staff' };
    expect(await repository.create(input)).toMatchObject({ lastModifiedBy: 'staff', clues: [] });
    expect(await repository.create({ ...input, clues: ['Tapa azul'] })).toMatchObject({ clues: ['Tapa azul'] });
  });

  it('keeps the mystery visibility restriction while fetching a complete requested ID set', async () => {
    const { item, repository } = setup();
    const visible = [{ id: 'won-object' }];
    item.findMany.mockResolvedValue(visible);
    expect(await repository.findAll({ ids: ['won-object'], visibleTo: 'winner', limit: 1, offset: 20 })).toBe(visible);
    const query = item.findMany.mock.calls[0][0];
    expect(query.where.OR).toEqual([{ mystery: false }, { awardedTo: 'winner' }]);
    expect(query.where.id.in).toEqual(['won-object']);
    expect(query.take).toBeUndefined();
    expect(query.skip).toBeUndefined();
  });

  it('paginates unrestricted staff listings without adding student visibility filters', async () => {
    const { item, repository } = setup();
    item.findMany.mockResolvedValue([]);
    await repository.findAll({ limit: 24, offset: 48, status: 'AVAILABLE', category: 'Libros' });
    const query = item.findMany.mock.calls[0][0];
    expect(query).toMatchObject({ take: 24, skip: 48, where: { status: 'AVAILABLE', category: 'Libros' } });
    expect(query.where).not.toHaveProperty('OR');
  });

  it('returns null when a requested item does not exist', async () => {
    const { item, repository } = setup();
    item.findUnique.mockResolvedValue(null);
    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('updates only the expected version and advances it without replacing untouched fields', async () => {
    const { item, repository } = setup();
    const updated = { id: 'item', name: 'Nuevo título', version: 4 };
    item.update.mockResolvedValue(updated);
    expect(await repository.update({ id: 'item', expectedVersion: 3, patch: { name: 'Nuevo título' }, lastModifiedBy: 'staff' })).toBe(updated);
    const query = item.update.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'item', version: 3 });
    expect(query.data).toMatchObject({ version: { increment: 1 }, lastModifiedBy: 'staff' });
    expect(query.data).not.toHaveProperty('description');
  });

  it('translates a stale or missing update into a domain conflict with its item ID', async () => {
    const { item, repository } = setup();
    item.update.mockRejectedValue({ code: 'P2025' });
    const result = repository.update({ id: 'item', expectedVersion: 1, patch: {}, lastModifiedBy: 'staff' });
    await expect(result).rejects.toBeInstanceOf(ItemVersionConflictError);
    await expect(result).rejects.toMatchObject({ id: 'item' });
  });

  it.each([null, 'offline', new Error('Database unavailable'), { code: 'P2002' }])('does not relabel unrelated update errors: %s', async (failure) => {
    const { item, repository } = setup();
    item.update.mockRejectedValue(failure);
    await expect(repository.update({ id: 'item', expectedVersion: 1, patch: {}, lastModifiedBy: 'staff' })).rejects.toBe(failure);
  });

  it.each([[0, false], [1, true]])('reports whether conditional deletion removed a row: %i', async (count, removed) => {
    const { item, repository } = setup();
    item.deleteMany.mockResolvedValue({ count });
    await expect(repository.delete('item', 2)).resolves.toBe(removed);
    expect(item.deleteMany.mock.calls[0][0].where).toMatchObject({
      version: 2, lotId: null, roundId: null, status: { notIn: ['SOLD'] },
    });
  });
});
