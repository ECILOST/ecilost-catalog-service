import { MediaKind } from '../../src/generated/prisma/enums.js';
import type { MediaAsset } from '../../src/media-asset/entities/media-asset.entity.js';
import {
  MediaOwnerNotFoundError,
  VideoAlreadyExistsError,
  type AttachMediaInput,
  type MediaAssetRepository,
} from '../../src/media-asset/ports/media-asset.repository.js';
import type { MediaStorage } from '../../src/media-asset/ports/media-storage.js';
import { CachingMediaStorage } from '../../src/media-asset/storage/caching-media-storage.js';
import type { FakeItemRepository } from './fake-repositories.js';

/**
 * Doble en memoria del puerto de metadatos. Existe para que el caso de uso corra sin
 * Postgres; la integracion de verdad usa PrismaMediaAssetRepository.
 *
 * Reproduce las dos condiciones que en produccion arbitra la base: la clave foranea hacia
 * el objeto y el indice unico que deja un solo video por objeto. Sin eso, las pruebas
 * pasarian con un adaptador que no cumple el contrato del puerto.
 */
export class FakeMediaAssetRepository implements MediaAssetRepository {
  readonly rows = new Map<string, MediaAsset>();

  /** El doble del catalogo hace de tabla `items`, que es a donde apunta la clave foranea. */
  constructor(private readonly items: FakeItemRepository) {}

  async attach(input: AttachMediaInput): Promise<MediaAsset> {
    if (!(await this.items.findById(input.itemId))) {
      throw new MediaOwnerNotFoundError(input.itemId);
    }

    if (input.kind === MediaKind.VIDEO && this.videoOf(input.itemId)) {
      throw new VideoAlreadyExistsError(input.itemId);
    }

    const created: MediaAsset = {
      id: input.id,
      itemId: input.itemId,
      kind: input.kind,
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      position: input.position,
      videoSlot: input.kind === MediaKind.VIDEO ? input.itemId : null,
      uploadedBy: input.uploadedBy,
      uploadedAt: new Date(),
    };
    this.rows.set(created.id, created);
    return created;
  }

  async findByItem(itemId: string): Promise<MediaAsset[]> {
    return [...this.rows.values()]
      .filter((asset) => asset.itemId === itemId)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position);
  }

  async findCovers(itemIds: string[]): Promise<Map<string, MediaAsset>> {
    const covers = new Map<string, MediaAsset>();

    for (const itemId of itemIds) {
      // La de menor posicion, como el adaptador de verdad: `findByItem` ya las entrega
      // ordenadas, asi que la primera fotografia de la lista es la portada.
      const photo = (await this.findByItem(itemId)).find(
        (asset) => asset.kind === MediaKind.PHOTO,
      );
      if (photo) covers.set(itemId, photo);
    }

    return covers;
  }

  async countPhotos(itemId: string): Promise<number> {
    return (await this.findByItem(itemId)).filter(
      (a) => a.kind === MediaKind.PHOTO,
    ).length;
  }

  async detach(itemId: string, id: string): Promise<MediaAsset | null> {
    const found = this.rows.get(id);
    // Las dos condiciones juntas, como el WHERE del adaptador: una pieza de otra ficha no
    // se borra ni se distingue de una que no existe.
    if (!found || found.itemId !== itemId) return null;

    this.rows.delete(id);
    return found;
  }

  private videoOf(itemId: string): MediaAsset | undefined {
    return [...this.rows.values()].find(
      (asset) => asset.itemId === itemId && asset.kind === MediaKind.VIDEO,
    );
  }
}

/**
 * Doble en memoria del almacen de objetos. Guarda los bytes en un mapa para poder afirmar
 * en las pruebas que la subida y el borrado llegan al almacen, sin levantar MinIO.
 *
 * Firma distinto en cada llamada, igual que S3: una firma real lleva dentro el instante en
 * que se produjo. Reproducirlo importa, porque es lo que hace que la estabilidad del enlace
 * sea una propiedad demostrada de CachingMediaStorage y no una casualidad del doble.
 */
export class FakeMediaStorage implements MediaStorage {
  readonly objects = new Map<
    string,
    { content: Buffer; contentType: string }
  >();

  /** Cuantas veces se ha firmado. Sube en cada llamada, como el reloj de una firma real. */
  firmas = 0;

  /** Se puede encender para comprobar que un fallo de limpieza no tumba la operacion. */
  failOnRemove = false;

  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { content, contentType });
  }

  async remove(key: string): Promise<void> {
    if (this.failOnRemove) throw new Error('el almacen no responde');
    this.objects.delete(key);
  }

  async signedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    this.firmas += 1;
    return `https://almacen.test/${key}?firma=${this.firmas}&expira=${ttlSeconds}`;
  }
}

/**
 * El almacen tal como lo arma el modulo en produccion: el adaptador real detras de la
 * cache de enlaces. Las pruebas de extremo a extremo lo usan para ejercitar la misma
 * composicion que corre de verdad, con un doble solo en el fondo.
 */
export function almacenComoEnProduccion(): CachingMediaStorage {
  return new CachingMediaStorage(new FakeMediaStorage());
}
