import { describe, expect, it } from 'vitest';
import {
  MediaTooLargeError,
  UnsupportedMediaFormatError,
} from '../../media-asset/domain/media-errors.js';
import type { MediaStorage } from '../../media-asset/ports/media-storage.js';
import {
  LotNotFoundError,
  LotPhotoLimitReachedError,
  LotPhotoNotFoundError,
  LotPhotoService,
  LotVideoNotAllowedError,
  MAX_PHOTOS_PER_LOT,
  type LotPhoto,
} from './lot-photo.service.js';

const JPEG = (size = 2048) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(size - 4),
  ]);
const PNG = (size = 2048) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(size - 8),
  ]);
const MP4 = (size = 8192) =>
  Buffer.concat([
    Buffer.from([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]),
    Buffer.alloc(size - 12),
  ]);

function setup(lotIds = ['lot-1']) {
  const lots = new Set(lotIds);
  const rows: LotPhoto[] = [];
  const blobs = new Map<string, Buffer>();

  const prisma = {
    lot: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        lots.has(where.id)
          ? {
              id: where.id,
              _count: {
                photos: rows.filter((r) => r.lotId === where.id).length,
              },
            }
          : null,
    },
    lotPhoto: {
      create: async ({ data }: { data: Omit<LotPhoto, 'uploadedAt'> }) => {
        const row = { ...data, uploadedAt: new Date() };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; lotId: string } }) =>
        rows.find((r) => r.id === where.id && r.lotId === where.lotId) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        const index = rows.findIndex((r) => r.id === where.id);
        return rows.splice(index, 1)[0];
      },
      findMany: async ({
        where,
      }: {
        where: { lotId: string | { in: string[] } };
      }) =>
        rows
          .filter((r) =>
            typeof where.lotId === 'string'
              ? r.lotId === where.lotId
              : where.lotId.in.includes(r.lotId),
          )
          .sort((a, b) => a.position - b.position),
    },
  };
  const storage: MediaStorage = {
    put: async (key, content) => void blobs.set(key, content),
    remove: async (key) => void blobs.delete(key),
    signedReadUrl: async (key) => `https://blob/${key}?se=x`,
  };

  const service = new LotPhotoService(prisma as never, storage);
  const attach = (lotId: string, content: Buffer) =>
    service.attach({
      lotId,
      uploadedBy: 'staff-1',
      file: { content, sizeBytes: content.length },
    });
  return { service, attach, rows, blobs };
}

describe('LotPhotoService', () => {
  it('adjunta una fotografia al lote, la guarda en el almacen y la devuelve firmada', async () => {
    const { attach, rows, blobs } = setup();

    const photo = await attach('lot-1', JPEG());

    expect(photo.url).toMatch(/^https:\/\/blob\/lots\/lot-1\/.+\.jpg\?se=x$/);
    expect(photo.contentType).toBe('image/jpeg');
    expect(rows).toHaveLength(1);
    expect(blobs.size).toBe(1);
  });

  it('ordena las fotografias y la primera es la portada', async () => {
    const { service, attach } = setup(['lot-1', 'lot-2']);
    const first = await attach('lot-1', JPEG());
    await attach('lot-1', PNG());

    const gallery = await service.findByLot('lot-1');
    const covers = await service.findCovers(['lot-1', 'lot-2']);

    expect(gallery.map((p) => p.position)).toEqual([0, 1]);
    expect(covers.get('lot-1')).toBe(first.url);
    expect(covers.has('lot-2')).toBe(false);
  });

  it('rechaza un video: un lote solo lleva fotografias', async () => {
    const { attach, blobs } = setup();
    await expect(attach('lot-1', MP4())).rejects.toBeInstanceOf(
      LotVideoNotAllowedError,
    );
    expect(blobs.size).toBe(0);
  });

  it('rechaza lo que no es imagen y lo que pesa mas de 5 MB, sin escribir nada', async () => {
    const { attach, blobs } = setup();
    await expect(
      attach('lot-1', Buffer.from('%PDF-1.7 hola')),
    ).rejects.toBeInstanceOf(UnsupportedMediaFormatError);
    await expect(attach('lot-1', JPEG(6 * 1024 * 1024))).rejects.toBeInstanceOf(
      MediaTooLargeError,
    );
    expect(blobs.size).toBe(0);
  });

  it(`no pasa de ${MAX_PHOTOS_PER_LOT} fotografias por lote`, async () => {
    const { attach } = setup();
    for (let i = 0; i < MAX_PHOTOS_PER_LOT; i += 1)
      await attach('lot-1', JPEG());
    await expect(attach('lot-1', JPEG())).rejects.toBeInstanceOf(
      LotPhotoLimitReachedError,
    );
  });

  it('un lote inexistente responde no encontrado', async () => {
    const { attach } = setup();
    await expect(attach('lot-x', JPEG())).rejects.toBeInstanceOf(
      LotNotFoundError,
    );
  });

  it('quita la fotografia del lote y del almacen, y no borra la de otro lote', async () => {
    const { service, attach, rows, blobs } = setup(['lot-1', 'lot-2']);
    const photo = await attach('lot-1', JPEG());

    await expect(service.remove('lot-2', photo.id)).rejects.toBeInstanceOf(
      LotPhotoNotFoundError,
    );
    await service.remove('lot-1', photo.id);

    expect(rows).toHaveLength(0);
    expect(blobs.size).toBe(0);
  });
});
