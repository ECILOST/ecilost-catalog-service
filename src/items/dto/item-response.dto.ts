import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemCondition, ItemStatus } from '../../generated/prisma/enums.js';
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
