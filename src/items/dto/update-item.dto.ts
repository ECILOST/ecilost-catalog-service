import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ItemCondition, ItemStatus } from '../../generated/prisma/enums.js';
import type { ItemPatch } from '../ports/item.repository.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Edicion parcial de un objeto (HU-04). Es el `ItemPatch` del diagrama de clases: un objeto
 * de valor sin identidad propia, no un recurso.
 *
 * Un campo ausente no se toca. `version` es el unico obligatorio, porque sin ella no hay
 * forma de saber si el funcionario esta editando la ficha que leyo o una ya desactualizada.
 */
export class UpdateItemDto {
  @ApiProperty({
    description:
      'Version que leiste en el GET. Si otra persona edito el objeto entre medias, la ' +
      'version ya no coincide y la peticion se rechaza con 409 en vez de pisar su cambio.',
    example: 0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt({ message: 'version es obligatorio y debe ser un entero' })
  @Min(0)
  version: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'name no puede quedar vacio' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'description no puede quedar vacio' })
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: Object.values(ItemCondition) })
  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'category no puede quedar vacio' })
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({
    enum: Object.values(ItemStatus),
    description:
      'Solo se admite retirar un objeto disponible (WITHDRAWN) y reponerlo (AVAILABLE). ' +
      'IN_LOT lo mueve la creacion de lotes, IN_ROUND la programacion de la sala y SOLD ' +
      'la adjudicacion. Cualquier otra transicion responde 409.',
  })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}

/**
 * Convierte el DTO en el cambio que entiende el puerto, dejando fuera las claves que el
 * cliente no envio.
 *
 * class-transformer devuelve una instancia con todas las propiedades declaradas, y las
 * ausentes valen `undefined`. Propagarlas tal cual hace que `{...actual, ...patch}` borre
 * campos que nadie pidio tocar. Prisma interpreta `undefined` como "no tocar" y lo
 * perdonaria, pero el contrato del puerto dice que un campo ausente no se toca, y eso no
 * puede depender de que motor haya debajo.
 */
export function toItemPatch(dto: UpdateItemDto): ItemPatch {
  const patch: ItemPatch = {};
  if (dto.name !== undefined) patch.name = dto.name;
  if (dto.description !== undefined) patch.description = dto.description;
  if (dto.condition !== undefined) patch.condition = dto.condition;
  if (dto.category !== undefined) patch.category = dto.category;
  if (dto.status !== undefined) patch.status = dto.status;
  return patch;
}
