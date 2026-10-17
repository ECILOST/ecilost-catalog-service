import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SignedMediaAsset } from '../../media-asset/entities/media-asset.entity.js';
import type { Lot } from '../entities/lot.entity.js';

export class LotItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

/**
 * Una fotografia de un objeto del lote. El lote no tiene galeria propia: muestra las que ya
 * se adjuntaron a cada objeto (HU-07), con el objeto al que pertenecen para poder rotularlas.
 * `storageKey` no sale, para que nadie arme enlaces a mano en vez de usar los firmados.
 */
export class LotItemPhotoResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiProperty() itemName: string;
  @ApiProperty({ example: 'image/jpeg' }) contentType: string;
  @ApiProperty() sizeBytes: number;
  @ApiProperty({ description: 'Lugar en la galeria de su objeto.' })
  position: number;
  @ApiProperty({
    description: 'Enlace de lectura de vida corta (quince minutos).',
  })
  url: string;
  @ApiProperty({ format: 'date-time' }) uploadedAt: Date;
}

/** Fotografia de un objeto, ya firmada, junto con el nombre del objeto. */
export type LotItemPhoto = SignedMediaAsset & { itemName: string };

export class LotResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'IN_ROUND', 'CLOSED', 'CANCELLED'] })
  status: string;
  @ApiProperty({ type: [LotItemResponseDto] }) items: LotItemResponseDto[];
  @ApiProperty() createdBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Portada del primer objeto del lote que tenga fotografia, firmada; nulo si ninguno tiene.',
  })
  coverUrl: string | null;
  @ApiPropertyOptional({
    type: [LotItemPhotoResponseDto],
    description:
      'Las fotografias de todos sus objetos, en el orden de los objetos. Solo en `GET /lots/:id`.',
  })
  photos?: LotItemPhotoResponseDto[];
}

export function toLotResponse(
  lot: Lot,
  coverUrl: string | null = null,
  photos?: LotItemPhoto[],
): LotResponseDto {
  return {
    id: lot.id,
    name: lot.name,
    status: lot.status,
    items: lot.items.map((item) => ({ id: item.id, name: item.name })),
    createdBy: lot.createdBy,
    createdAt: lot.createdAt,
    coverUrl: photos ? (photos[0]?.url ?? null) : coverUrl,
    ...(photos ? { photos: photos.map(toLotItemPhotoResponse) } : {}),
  };
}

function toLotItemPhotoResponse(photo: LotItemPhoto): LotItemPhotoResponseDto {
  return {
    id: photo.id,
    itemId: photo.itemId,
    itemName: photo.itemName,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    position: photo.position,
    url: photo.url,
    uploadedAt: photo.uploadedAt,
  };
}
