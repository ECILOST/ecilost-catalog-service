import { describe, expect, it, vi } from 'vitest';
import { Principal } from '../auth/domain/principal.js';
import { Role } from '../auth/domain/role.enum.js';
import { LotsController } from './lots.controller.js';

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Objeto ${id}`,
  mystery: false,
  awardedTo: null,
  ...extra,
});

const lot = (id: string, items: ReturnType<typeof item>[]) => ({
  id,
  name: `Lote ${id}`,
  status: 'ACTIVE',
  createdBy: 'staff-1',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  mystery: false,
  items,
});

const photo = (id: string, itemId: string, position = 0) => ({
  id,
  itemId,
  kind: 'PHOTO',
  storageKey: `items/${itemId}/${id}`,
  contentType: 'image/jpeg',
  sizeBytes: 10,
  position,
  videoSlot: null,
  uploadedBy: 'staff-1',
  uploadedAt: new Date('2026-10-01T00:00:00Z'),
  url: `https://almacen.test/${id}`,
});

const student = new Principal('student-1', Role.STUDENT);

function controllerWith(
  lots: unknown[],
  photosByItem: Record<string, unknown[]>,
) {
  const service = {
    findAll: vi.fn().mockResolvedValue(lots),
    findOne: vi.fn().mockResolvedValue(lots[0]),
  };
  const media = {
    findByItem: vi.fn((itemId: string) =>
      Promise.resolve({ photos: photosByItem[itemId] ?? [], video: null }),
    ),
    findCovers: vi.fn((ids: string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id) => photosByItem[id]?.length)
            .map((id) => [id, `https://almacen.test/cover-${id}`]),
        ),
      ),
    ),
  };
  return {
    controller: new LotsController(service as never, media as never),
    media,
  };
}

describe('LotsController: fotos del lote tomadas de sus objetos', () => {
  it('la ficha muestra las fotos de cada objeto, en el orden de los objetos y rotuladas', async () => {
    const { controller } = controllerWith(
      [lot('l1', [item('a'), item('b'), item('c')])],
      {
        a: [photo('a1', 'a'), photo('a2', 'a', 1)],
        c: [photo('c1', 'c')],
      },
    );

    const result = await controller.findOne(student, 'l1');

    expect(result.photos?.map((p) => [p.id, p.itemName])).toEqual([
      ['a1', 'Objeto a'],
      ['a2', 'Objeto a'],
      ['c1', 'Objeto c'],
    ]);
    expect(result.coverUrl).toBe('https://almacen.test/a1');
    expect(result.photos?.[0]).not.toHaveProperty('storageKey');
  });

  it('el listado usa de portada la del primer objeto que tenga foto, en una sola consulta', async () => {
    const { controller, media } = controllerWith(
      [lot('l1', [item('a'), item('b')]), lot('l2', [item('c'), item('d')])],
      { b: [photo('b1', 'b')] },
    );

    const result = await controller.findAll(student, {});

    expect(result.map((l) => l.coverUrl)).toEqual([
      'https://almacen.test/cover-b',
      null,
    ]);
    expect(media.findCovers).toHaveBeenCalledOnce();
    expect(result[0]).not.toHaveProperty('photos');
  });

  it('un objeto misterioso no presta sus fotos al estudiante', async () => {
    const { controller, media } = controllerWith(
      [lot('l1', [item('a', { mystery: true }), item('b')])],
      {
        a: [photo('a1', 'a')],
        b: [photo('b1', 'b')],
      },
    );

    const result = await controller.findOne(student, 'l1');

    expect(result.photos?.map((p) => p.id)).toEqual(['b1']);
    expect(media.findByItem).not.toHaveBeenCalledWith('a');
  });
});
