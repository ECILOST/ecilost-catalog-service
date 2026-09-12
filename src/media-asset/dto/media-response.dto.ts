import { ApiProperty } from '@nestjs/swagger';
import { MediaKind } from '../../generated/prisma/enums.js';
import type { SignedMediaAsset } from '../entities/media-asset.entity.js';

/**
 * Proyeccion publica de una pieza multimedia. Se escribe a mano, campo por campo, para que
 * agregar una columna interna al esquema no la publique sin querer.
 *
 * `storageKey` es justamente una de esas columnas que no sale: revelar la ruta interna del
 * almacen invitaria a construir enlaces a mano en vez de usar los firmados.
 */
export class MediaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: Object.values(MediaKind),
    description: 'De fotografias hay varias; de video, a lo sumo una.',
  })
  kind: MediaKind;

  @ApiProperty({
    description:
      'Tipo real del archivo, deducido de sus bytes al subirlo y no del que declaro el ' +
      'cliente.',
    example: 'image/jpeg',
  })
  contentType: string;

  @ApiProperty({ example: 248_312 })
  sizeBytes: number;

  @ApiProperty({
    description:
      'Lugar en la galeria. Las fotografias llegan ya ordenadas por el.',
    example: 0,
  })
  position: number;

  @ApiProperty({
    description:
      'Enlace de lectura de vida corta. El navegador baja el archivo del almacen con el, ' +
      'sin pasar por este servicio. Caduca, asi que no sirve guardarlo ni compartirlo: ' +
      'hay que releer la ficha para obtener uno nuevo.',
    example:
      'http://localhost:9000/ecilost-catalog-media/items/.../a1b2.jpg?X-Amz-...',
  })
  url: string;

  @ApiProperty({ format: 'date-time' })
  uploadedAt: Date;
}

export function toMediaResponse(asset: SignedMediaAsset): MediaResponseDto {
  return {
    id: asset.id,
    kind: asset.kind,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    position: asset.position,
    url: asset.url,
    uploadedAt: asset.uploadedAt,
  };
}
