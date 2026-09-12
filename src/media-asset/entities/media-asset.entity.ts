import { MediaKind } from '../../generated/prisma/enums.js';
import type { MediaAssetModel } from '../../generated/prisma/models.js';

/** Pieza multimedia del catalogo. La forma del dato la manda prisma/schema.prisma. */
export type MediaAsset = MediaAssetModel;

/**
 * Pieza multimedia con su URL de lectura ya firmada.
 *
 * La URL no es una columna: se calcula al armar la ficha y caduca. Se modela aparte para
 * que quede claro que una `MediaAsset` sola no alcanza para entregarsela a un cliente.
 */
export interface SignedMediaAsset extends MediaAsset {
  url: string;
}

/**
 * La multimedia de un objeto tal como la consume su ficha.
 *
 * `video` es nulo cuando el objeto no tiene ninguno, y nunca esta ausente. La ficha de un
 * objeto sin video tiene que renderizarse igual de bien que la de uno con video, que es el
 * tercer criterio de la HU-08.
 */
export interface ItemMedia {
  photos: SignedMediaAsset[];
  video: SignedMediaAsset | null;
}

/** Reparte las piezas en la forma que espera la ficha. Las fotos salen en su orden. */
export function splitByKind(assets: SignedMediaAsset[]): ItemMedia {
  const photos = assets
    .filter((asset) => asset.kind === MediaKind.PHOTO)
    .sort((a, b) => a.position - b.position);

  return {
    photos,
    video: assets.find((asset) => asset.kind === MediaKind.VIDEO) ?? null,
  };
}

/** La ficha vacia. Evita repartir un arreglo vacio para llegar al mismo sitio. */
export const NO_MEDIA: ItemMedia = { photos: [], video: null };
