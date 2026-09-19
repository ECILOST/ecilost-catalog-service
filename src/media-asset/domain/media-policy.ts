import { MediaKind } from '../../generated/prisma/enums.js';

/**
 * Limites de la multimedia del catalogo.
 *
 * Son constantes y no variables de entorno a proposito: describen el producto, no el
 * despliegue. Un video de cien megabytes es demasiado para documentar un objeto perdido
 * en cualquier entorno, y dejarlo configurable invitaria a subirlo en produccion.
 */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Tope duro del transporte. Multer corta la subida antes de terminar de leerla. */
export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES;

/**
 * Cuantas fotografias admite un objeto. Una galeria documenta un objeto perdido; no es un
 * album.
 */
export const MAX_PHOTOS_PER_ITEM = 10;

/**
 * Cuanto vive la URL de lectura que viaja en la ficha.
 *
 * Corta para que un enlace copiado y pegado deje de servir, y lo bastante larga para que
 * un estudiante termine de ver el video sin que se le corte a la mitad.
 */
export const READ_URL_TTL_SECONDS = 15 * 60;

export function maxBytesFor(kind: MediaKind): number {
  return kind === MediaKind.VIDEO ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
}

/** Para los mensajes de error: megabytes con un decimal, sin arrastrar el `.0`. */
export function asMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '');
}
