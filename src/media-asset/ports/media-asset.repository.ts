import type { MediaKind } from '../../generated/prisma/enums.js';
import type { MediaAsset } from '../entities/media-asset.entity.js';

export interface AttachMediaInput {
  /** Se genera fuera del adaptador: la clave del almacen se arma con el antes de escribir. */
  id: string;
  itemId: string;
  kind: MediaKind;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  /** Lugar en la galeria. Irrelevante para un video. */
  position: number;
  uploadedBy: string;
}

/**
 * Se intento colgar multimedia de un objeto que no existe. Lo detecta la clave foranea,
 * no una consulta previa: comprobar que el objeto existe y escribir despues dejaria una
 * ventana en la que el funcionario lo borra justo en medio.
 */
export class MediaOwnerNotFoundError extends Error {
  constructor(readonly itemId: string) {
    super(`No existe un objeto con identificador ${itemId}.`);
    this.name = 'MediaOwnerNotFoundError';
  }
}

/**
 * El objeto ya tiene video. Lo detecta el indice unico sobre `videoSlot`, de modo que dos
 * subidas simultaneas no pueden pasar las dos.
 */
export class VideoAlreadyExistsError extends Error {
  constructor(readonly itemId: string) {
    super(
      'El objeto ya tiene un video. Borra el actual antes de subir otro: la ficha ' +
        'muestra un solo video.',
    );
    this.name = 'VideoAlreadyExistsError';
  }
}

/**
 * Puerto de salida hacia el almacen de metadatos de la multimedia. Los bytes no pasan por
 * aqui: eso es MediaStorage. Esta separacion es la que permite probar el caso de uso sin
 * Postgres y sin almacen de objetos.
 */
export interface MediaAssetRepository {
  /**
   * Registra la pieza. Lanza MediaOwnerNotFoundError si el objeto no existe y
   * VideoAlreadyExistsError si ya tenia video: las dos condiciones las arbitra la base.
   */
  attach(input: AttachMediaInput): Promise<MediaAsset>;

  /** Toda la multimedia del objeto, para armar su ficha. */
  findByItem(itemId: string): Promise<MediaAsset[]>;

  countPhotos(itemId: string): Promise<number>;

  /**
   * Borra la pieza solo si cuelga de ese objeto, y devuelve la fila borrada para que el
   * caso de uso sepa que archivo retirar del almacen. Devuelve null si no borro nada.
   *
   * El `itemId` viaja en el WHERE junto al `id`: comprobar antes a quien pertenece y
   * borrar despues permitiria borrar multimedia de otra ficha con un identificador
   * adivinado, y el criterio 3 exige que el resto del contenido quede intacto.
   */
  detach(itemId: string, id: string): Promise<MediaAsset | null>;
}

export const MEDIA_ASSET_REPOSITORY = Symbol('MediaAssetRepository');
