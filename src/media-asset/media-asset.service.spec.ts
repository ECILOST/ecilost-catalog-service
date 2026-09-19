import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeMediaAssetRepository,
  FakeMediaStorage,
} from '../../test/helpers/fake-media.js';
import { FakeItemRepository } from '../../test/helpers/fake-repositories.js';
import { jpeg, mp4, pdf, png } from '../../test/helpers/media-fixtures.js';
import type { Item } from '../items/entities/item.entity.js';
import {
  MediaAssetNotFoundError,
  MediaTooLargeError,
  PhotoLimitReachedError,
  UnsupportedMediaFormatError,
} from './domain/media-errors.js';
import {
  MAX_PHOTOS_PER_ITEM,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
} from './domain/media-policy.js';
import { MediaAssetService } from './media-asset.service.js';
import {
  MediaOwnerNotFoundError,
  VideoAlreadyExistsError,
} from './ports/media-asset.repository.js';

const FUNCIONARIO = '11111111-1111-4111-8111-111111111111';
const OBJETO_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

describe('MediaAssetService', () => {
  let items: FakeItemRepository;
  let assets: FakeMediaAssetRepository;
  let storage: FakeMediaStorage;
  let service: MediaAssetService;
  let objeto: Item;

  beforeEach(() => {
    items = new FakeItemRepository();
    assets = new FakeMediaAssetRepository(items);
    storage = new FakeMediaStorage();
    service = new MediaAssetService(assets, storage);
    objeto = items.seed();
  });

  const subir = (content: Buffer, sizeBytes = content.length) =>
    service.attach({
      itemId: objeto.id,
      uploadedBy: FUNCIONARIO,
      file: { content, sizeBytes },
    });

  describe('attach — criterio 1: los archivos quedan asociados al objeto', () => {
    it('guarda la fotografia y la deja referenciada desde la ficha', async () => {
      const asset = await subir(jpeg());

      expect(asset.kind).toBe('PHOTO');
      expect(asset.itemId).toBe(objeto.id);
      expect(storage.objects.has(asset.storageKey)).toBe(true);

      const ficha = await service.findByItem(objeto.id);
      expect(ficha.photos).toHaveLength(1);
      expect(ficha.photos[0].id).toBe(asset.id);
    });

    it('admite varias fotografias y un video sobre el mismo objeto', async () => {
      await subir(jpeg());
      await subir(png());
      await subir(mp4());

      const ficha = await service.findByItem(objeto.id);
      expect(ficha.photos).toHaveLength(2);
      expect(ficha.video).not.toBeNull();
      expect(ficha.video?.kind).toBe('VIDEO');
    });

    it('deduce el tipo real de los bytes y no del nombre del archivo', async () => {
      // El mismo PNG llegaria con cualquier extension; lo que decide es la cabecera.
      const asset = await subir(png());

      expect(asset.contentType).toBe('image/png');
      expect(asset.storageKey.endsWith('.png')).toBe(true);
    });

    it('numera las fotografias para que la galeria salga siempre en el mismo orden', async () => {
      const primera = await subir(jpeg());
      const segunda = await subir(png());

      expect(primera.position).toBe(0);
      expect(segunda.position).toBe(1);
    });

    it('guarda quien la subio, tomado de la sesion', async () => {
      const asset = await subir(jpeg());

      expect(asset.uploadedBy).toBe(FUNCIONARIO);
    });

    it('entrega un enlace de lectura por pieza', async () => {
      const asset = await subir(jpeg());

      expect(asset.url).toContain(asset.storageKey);
    });

    it('no deja colgar multimedia de un objeto que no existe', async () => {
      await expect(
        service.attach({
          itemId: OBJETO_INEXISTENTE,
          uploadedBy: FUNCIONARIO,
          file: { content: jpeg(), sizeBytes: 2048 },
        }),
      ).rejects.toBeInstanceOf(MediaOwnerNotFoundError);

      // Y el archivo que se alcanzo a escribir se retira: no queda basura referenciable.
      expect(storage.objects.size).toBe(0);
    });
  });

  describe('attach — criterio 2: rechaza el tipo no soportado sin alterar la ficha', () => {
    it('rechaza un PDF nombrando los formatos que si se admiten', async () => {
      const error = await subir(pdf()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnsupportedMediaFormatError);
      expect((error as UnsupportedMediaFormatError).message).toContain('JPEG');
      expect((error as UnsupportedMediaFormatError).message).toContain('MP4');
    });

    it('no escribe nada, ni en el almacen ni en la ficha', async () => {
      await subir(jpeg());
      await subir(pdf()).catch(() => undefined);

      // La fotografia previa sigue ahi y el rechazo no agrego nada.
      expect(assets.rows.size).toBe(1);
      expect(storage.objects.size).toBe(1);

      const ficha = await service.findByItem(objeto.id);
      expect(ficha.photos).toHaveLength(1);
    });

    it('rechaza una fotografia que pasa del tope de tamano', async () => {
      await expect(subir(jpeg(), MAX_PHOTO_BYTES + 1)).rejects.toBeInstanceOf(
        MediaTooLargeError,
      );
      expect(storage.objects.size).toBe(0);
    });

    it('al video le aplica su propio tope, mas alto que el de una fotografia', async () => {
      // Un peso que rechazaria una foto pero es correcto para un video.
      const asset = await subir(mp4(), MAX_PHOTO_BYTES + 1);
      expect(asset.kind).toBe('VIDEO');

      await expect(subir(mp4(), MAX_VIDEO_BYTES + 1)).rejects.toBeInstanceOf(
        MediaTooLargeError,
      );
    });

    it('rechaza el segundo video, porque la ficha muestra uno solo', async () => {
      await subir(mp4());

      await expect(subir(mp4())).rejects.toBeInstanceOf(
        VideoAlreadyExistsError,
      );
      // El archivo del segundo intento no se queda colgado en el almacen.
      expect(storage.objects.size).toBe(1);
    });

    it('rechaza la fotografia que pasa del tope de cuantas admite el objeto', async () => {
      for (let i = 0; i < MAX_PHOTOS_PER_ITEM; i += 1) await subir(jpeg());

      await expect(subir(jpeg())).rejects.toBeInstanceOf(
        PhotoLimitReachedError,
      );
    });
  });

  describe('remove — criterio 3: desaparece la pieza y el resto queda intacto', () => {
    it('quita la fotografia de la ficha y su archivo del almacen', async () => {
      const asset = await subir(jpeg());

      await service.remove(objeto.id, asset.id);

      const ficha = await service.findByItem(objeto.id);
      expect(ficha.photos).toHaveLength(0);
      expect(storage.objects.has(asset.storageKey)).toBe(false);
    });

    it('deja intactas las demas fotografias y el video', async () => {
      const borrada = await subir(jpeg());
      const conservada = await subir(png());
      const video = await subir(mp4());

      await service.remove(objeto.id, borrada.id);

      const ficha = await service.findByItem(objeto.id);
      expect(ficha.photos.map((p) => p.id)).toEqual([conservada.id]);
      expect(ficha.video?.id).toBe(video.id);
      expect(storage.objects.has(conservada.storageKey)).toBe(true);
      expect(storage.objects.has(video.storageKey)).toBe(true);
    });

    it('borrar el video deja las fotografias y libera el sitio para otro', async () => {
      await subir(jpeg());
      const video = await subir(mp4());

      await service.remove(objeto.id, video.id);

      const sinVideo = await service.findByItem(objeto.id);
      expect(sinVideo.video).toBeNull();
      expect(sinVideo.photos).toHaveLength(1);

      // Y ahora si entra uno nuevo, que es lo que el mensaje de rechazo prometia.
      await expect(subir(mp4())).resolves.toBeDefined();
    });

    it('no borra multimedia que cuelga de otro objeto', async () => {
      const ajeno = items.seed();
      const suya = await service.attach({
        itemId: ajeno.id,
        uploadedBy: FUNCIONARIO,
        file: { content: jpeg(), sizeBytes: 2048 },
      });

      // Se pide borrarla nombrando el objeto equivocado.
      await expect(service.remove(objeto.id, suya.id)).rejects.toBeInstanceOf(
        MediaAssetNotFoundError,
      );

      const ficha = await service.findByItem(ajeno.id);
      expect(ficha.photos).toHaveLength(1);
    });

    it('falla al pedir una pieza que no existe', async () => {
      await expect(
        service.remove(objeto.id, OBJETO_INEXISTENTE),
      ).rejects.toBeInstanceOf(MediaAssetNotFoundError);
    });

    it('la pieza sale de la ficha aunque el almacen falle al retirar el archivo', async () => {
      // Lo que el criterio promete es que desaparezca de la ficha. Un archivo que se queda
      // en el almacen es basura que nadie ve, y no debe convertir el borrado en un error.
      const asset = await subir(jpeg());
      storage.failOnRemove = true;

      await expect(
        service.remove(objeto.id, asset.id),
      ).resolves.toBeUndefined();

      const ficha = await service.findByItem(objeto.id);
      expect(ficha.photos).toHaveLength(0);
    });
  });

  describe('findByItem', () => {
    it('un objeto sin multimedia devuelve la ficha vacia, no un error', async () => {
      const ficha = await service.findByItem(objeto.id);

      expect(ficha.photos).toEqual([]);
      expect(ficha.video).toBeNull();
    });

    it('varias lecturas simultaneas devuelven todas las mismas piezas', async () => {
      await subir(jpeg());
      await subir(png());
      await subir(mp4());

      const fichas = await Promise.all(
        Array.from({ length: 20 }, () => service.findByItem(objeto.id)),
      );

      // El servicio no guarda estado entre peticiones, asi que veinte lecturas a la vez no
      // se estorban. Se comparan las piezas y no la respuesta entera porque el enlace lo
      // firma el almacen: que ademas sea identico entre lectores es cosa de
      // CachingMediaStorage, que tiene su propia prueba.
      const piezas = (f: (typeof fichas)[number]) => [
        ...f.photos.map((p) => `${p.id}:${p.position}`),
        f.video?.id ?? 'sin-video',
      ];

      const referencia = piezas(fichas[0]);
      expect(referencia).toHaveLength(3);
      for (const ficha of fichas) expect(piezas(ficha)).toEqual(referencia);
    });
  });
});
