import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Lot } from '../entities/lot.entity.js';
import type { SignedLotPhoto } from '../photos/lot-photo.service.js';
import { LotPhotoResponseDto, toLotPhotoResponse } from './lot-photo-response.dto.js';

export class LotItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class LotResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'IN_ROUND', 'CLOSED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: [LotItemResponseDto] }) items: LotItemResponseDto[];
  @ApiProperty() createdBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Primera fotografia del lote, firmada; nulo si no tiene ninguna.',
  })
  coverUrl: string | null;
  @ApiPropertyOptional({
    type: [LotPhotoResponseDto],
    description: 'La galeria completa. Solo en `GET /lots/:id`; el listado trae la portada.',
  })
  photos?: LotPhotoResponseDto[];
}

export function toLotResponse(
  lot: Lot,
  coverUrl: string | null = null,
  photos?: SignedLotPhoto[],
): LotResponseDto {
  return {
    id: lot.id,
    name: lot.name,
    status: lot.status,
    items: lot.items.map((item) => ({ id: item.id, name: item.name })),
    createdBy: lot.createdBy,
    createdAt: lot.createdAt,
    coverUrl: photos ? (photos[0]?.url ?? null) : coverUrl,
    ...(photos ? { photos: photos.map(toLotPhotoResponse) } : {}),
  };
}
