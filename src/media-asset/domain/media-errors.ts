import { MediaKind } from '../../generated/prisma/enums.js';
import { SUPPORTED_LABELS } from './media-format.js';
import {
  asMegabytes,
  MAX_PHOTOS_PER_ITEM,
  maxBytesFor,
} from './media-policy.js';

/**
 * Errores de dominio de la multimedia. El servicio los lanza y el controlador los traduce
 * a un codigo HTTP: aqui no se conoce el transporte.
 *
 * Los que nacen de una restriccion de la base, como el video duplicado o el objeto que no
 * existe, viven en el puerto, porque es el adaptador quien los detecta.
 */

/**
 * HU-07, criterio 2: el archivo no es de un tipo soportado.
 *
 * El mensaje enumera los formatos admitidos, que es justo lo que el criterio exige. Se
 * lanza antes de escribir nada, ni en el almacen ni en la base, de modo que la ficha queda
 * exactamente como estaba.
 */
export class UnsupportedMediaFormatError extends Error {
  readonly supported = SUPPORTED_LABELS;

  constructor() {
    super(
      `El archivo no es de un tipo soportado. Se admiten: ${SUPPORTED_LABELS.join(', ')}.`,
    );
    this.name = 'UnsupportedMediaFormatError';
  }
}

/** El archivo es del tipo correcto pero pesa mas de lo que admite su categoria. */
export class MediaTooLargeError extends Error {
  constructor(
    readonly kind: MediaKind,
    readonly sizeBytes: number,
  ) {
    const limit = asMegabytes(maxBytesFor(kind));
    const pieza = kind === MediaKind.VIDEO ? 'El video' : 'La fotografia';
    super(
      `${pieza} pesa ${asMegabytes(sizeBytes)} MB y el maximo son ${limit} MB.`,
    );
    this.name = 'MediaTooLargeError';
  }
}

/** El objeto ya llego al tope de fotografias. */
export class PhotoLimitReachedError extends Error {
  constructor(readonly itemId: string) {
    super(
      `El objeto ya tiene ${MAX_PHOTOS_PER_ITEM} fotografias, que es el maximo. ` +
        'Borra alguna antes de subir otra.',
    );
    this.name = 'PhotoLimitReachedError';
  }
}

/**
 * HU-07, criterio 3: se pidio borrar una pieza que no esta en la ficha de ese objeto.
 *
 * Cubre dos casos que al cliente le dan lo mismo: que no exista, y que exista pero cuelgue
 * de otro objeto. Distinguirlos permitiria averiguar, probando identificadores, que
 * multimedia tienen las fichas ajenas.
 */
export class MediaAssetNotFoundError extends Error {
  constructor(
    readonly itemId: string,
    readonly mediaId: string,
  ) {
    super(
      `El objeto ${itemId} no tiene multimedia con identificador ${mediaId}.`,
    );
    this.name = 'MediaAssetNotFoundError';
  }
}
