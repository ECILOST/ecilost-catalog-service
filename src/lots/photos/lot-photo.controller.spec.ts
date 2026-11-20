import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Principal } from '../../auth/domain/principal.js';
import { MediaTooLargeError, UnsupportedMediaFormatError } from '../../media-asset/domain/media-errors.js';
import { MediaKind } from '../../generated/prisma/enums.js';
import { LotPhotoController } from './lot-photo.controller.js';
import {
  LotNotFoundError,
  LotPhotoLimitReachedError,
  LotPhotoNotFoundError,
  type LotPhotoService,
  LotVideoNotAllowedError,
} from './lot-photo.service.js';

const operator = new Principal('operator', 'STAFF');
const lotId = 'lot-1';
const photoId = 'photo-1';
const file = { buffer: Buffer.from('photo'), size: 5 };

function setup() {
  const photos = { attach: vi.fn(), remove: vi.fn() };
  return { photos, controller: new LotPhotoController(photos as unknown as LotPhotoService) };
}

describe('LotPhotoController', () => {
  it('attaches the photo to the requested lot and returns the public photo fields', async () => {
    const { photos, controller } = setup();
    const photo = {
      id: photoId, contentType: 'image/jpeg', sizeBytes: file.size, position: 0,
      url: 'https://example.test/photo', uploadedAt: new Date('2030-01-01T00:00:00Z'),
    };
    photos.attach.mockResolvedValue({ ...photo, lotId, storageKey: 'internal/photo' });

    await expect(controller.upload(operator, lotId, file)).resolves.toEqual(photo);
    expect(photos.attach).toHaveBeenCalledWith({
      lotId, uploadedBy: operator.userId, file: { content: file.buffer, sizeBytes: file.size },
    });
  });

  it.each([undefined, { buffer: Buffer.alloc(0), size: 0 }])('rejects missing and empty uploads', async (input) => {
    const { photos, controller } = setup();
    await expect(controller.upload(operator, lotId, input)).rejects.toBeInstanceOf(BadRequestException);
    expect(photos.attach).not.toHaveBeenCalled();
  });

  it.each([
    [new UnsupportedMediaFormatError(), 415],
    [new LotVideoNotAllowedError(), 415],
    [new MediaTooLargeError(MediaKind.PHOTO, 20_000_000), 413],
    [new LotPhotoLimitReachedError(lotId), 409],
    [new LotNotFoundError(lotId), 404],
  ] as const)('maps upload error %s to HTTP %i', async (failure, status) => {
    const { photos, controller } = setup();
    photos.attach.mockRejectedValue(failure);
    await expect(controller.upload(operator, lotId, file)).rejects.toMatchObject({ status });
  });

  it('removes a photo from its lot and reports missing photos', async () => {
    const { photos, controller } = setup();
    await expect(controller.remove(lotId, photoId)).resolves.toBeUndefined();
    expect(photos.remove).toHaveBeenCalledWith(lotId, photoId);
    photos.remove.mockRejectedValue(new LotPhotoNotFoundError(lotId, photoId));
    await expect(controller.remove(lotId, photoId)).rejects.toMatchObject({ status: 404 });
  });

  it('preserves unexpected service errors', async () => {
    const { photos, controller } = setup();
    const error = new Error('storage offline');
    photos.remove.mockRejectedValue(error);
    await expect(controller.remove(lotId, photoId)).rejects.toBe(error);
  });
});

