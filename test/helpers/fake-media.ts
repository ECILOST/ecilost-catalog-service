import { MediaKind } from '../../src/generated/prisma/enums.js';
import type { MediaAsset } from '../../src/media-asset/entities/media-asset.entity.js';
import {
  MediaOwnerNotFoundError,
  VideoAlreadyExistsError,
  type AttachMediaInput,
  type MediaAssetRepository,
} from '../../src/media-asset/ports/media-asset.repository.js';
import type { MediaStorage } from '../../src/media-asset/ports/media-storage.js';
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
 * Doble en memoria del almacen de objetos. Guarda los bytes en un mapa y devuelve una URL
 * inventada pero reconocible, para poder afirmar en las pruebas que la ficha entrega un
 * enlace por pieza sin levantar MinIO.
 */
export class FakeMediaStorage implements MediaStorage {
  readonly objects = new Map<
    string,
    { content: Buffer; contentType: string }
  >();

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
    return `https://almacen.test/${key}?expira=${ttlSeconds}`;
  }
}
