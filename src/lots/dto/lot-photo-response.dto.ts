import { ApiProperty } from '@nestjs/swagger';
import type { SignedLotPhoto } from '../photos/lot-photo.service.js';

/**
 * Proyeccion publica de una fotografia de lote, campo por campo: `storageKey` no sale, para
 * que nadie arme enlaces a mano en vez de usar los firmados.
 */
export class LotPhotoResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'image/jpeg' }) contentType: string;
  @ApiProperty() sizeBytes: number;
  @ApiProperty({
    description: 'Lugar en la galeria; la primera es la portada.',
  })
  position: number;
  @ApiProperty({
    description: 'Enlace de lectura de vida corta (quince minutos).',
  })
  url: string;
  @ApiProperty({ format: 'date-time' }) uploadedAt: Date;
}

export function toLotPhotoResponse(photo: SignedLotPhoto): LotPhotoResponseDto {
  return {
    id: photo.id,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    position: photo.position,
    url: photo.url,
    uploadedAt: photo.uploadedAt,
  };
}
