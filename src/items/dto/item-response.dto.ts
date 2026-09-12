import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemCondition, ItemStatus } from '../../generated/prisma/enums.js';
import {
  MediaResponseDto,
  toMediaResponse,
} from '../../media-asset/dto/media-response.dto.js';
import type { ItemMedia } from '../../media-asset/entities/media-asset.entity.js';
import type { Item } from '../entities/item.entity.js';

/**
 * Proyeccion publica del objeto. Se escribe a mano, campo por campo, para que agregar una
 * columna interna al esquema no la publique sin querer.
 */
export class ItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: Object.values(ItemCondition) })
  condition: ItemCondition;

  @ApiProperty()
  category: string;

  @ApiProperty({
    enum: Object.values(ItemStatus),
    description: 'Un objeto recien registrado siempre sale AVAILABLE.',
  })
  status: ItemStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Lote que lo contiene, o null si esta libre.',
  })
  lotId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Ronda que lo tiene comprometido, o null si no esta en subasta.',
  })
  roundId: string | null;

  @ApiProperty({
    description:
      'Version vigente. Hay que devolverla en el PATCH para que el servicio detecte ' +
      'que otra persona edito el objeto entre medias.',
    example: 0,
  })
  version: number;

  @ApiProperty({ description: 'userId del funcionario que lo dio de alta.' })
  registeredBy: string;

  @ApiProperty({ format: 'date-time' })
  registeredAt: Date;

  @ApiProperty({ description: 'userId de quien lo modifico por ultima vez.' })
  lastModifiedBy: string;

  @ApiProperty({ format: 'date-time' })
  lastModifiedAt: Date;
}

/** Traduce la fila de la base al contrato publico, sin filtrar columnas internas. */
export function toItemResponse(item: Item): ItemResponseDto {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    condition: item.condition,
    category: item.category,
    status: item.status,
    lotId: item.lotId,
    roundId: item.roundId,
    version: item.version,
    registeredBy: item.registeredBy,
    registeredAt: item.registeredAt,
    lastModifiedBy: item.lastModifiedBy,
    lastModifiedAt: item.lastModifiedAt,
  };
}

/**
 * La ficha completa del objeto: sus datos mas su multimedia (HU-07, HU-08).
 *
 * Solo la consulta de un objeto la devuelve. El listado sigue entregando `ItemResponseDto`
 * a secas, porque firmar las URL de cada pieza de cada objeto de la pagina costaria una
 * ronda por objeto para algo que la lista no muestra.
 */
export class ItemDetailResponseDto extends ItemResponseDto {
  @ApiProperty({
    type: [MediaResponseDto],
    description:
      'Fotografias del objeto, ya ordenadas. Arreglo vacio si todavia no tiene ninguna.',
  })
  photos: MediaResponseDto[];

  @ApiProperty({
    type: MediaResponseDto,
    nullable: true,
    description:
      'El video del objeto, o `null` si no tiene. Nunca falta el campo: una ficha sin ' +
      'video debe poder renderizarse igual que una con video.',
  })
  video: MediaResponseDto | null;
}

export function toItemDetailResponse(item: Item, media: ItemMedia): ItemDetailResponseDto {
  return {
    ...toItemResponse(item),
    photos: media.photos.map(toMediaResponse),
    video: media.video ? toMediaResponse(media.video) : null,
  };
}
