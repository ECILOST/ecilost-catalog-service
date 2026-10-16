import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ItemStatus } from '../../generated/prisma/enums.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** `?ids=a,b,c` llega como una cadena; se valida como lista. */
export const commaList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : value;

/**
 * Filtros del catalogo. El tope de pagina es obligatorio y tiene maximo: una consulta sin
 * limite funciona con veinte objetos y tumba el servicio con veinte mil.
 */
export class ListItemsQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(ItemStatus),
    description: 'Filtra por estado. Sin este parametro devuelve todos.',
  })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional({ description: 'Filtra por categoria exacta.', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({
    description: 'Cuantos objetos devolver.',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ description: 'Cuantos saltar.', minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({
    description:
      'Solo estos objetos, separados por comas. Con ids no se pagina: vuelven todos los ' +
      'que existan, hasta ' + MAX_PAGE_SIZE + '.',
    example: '1f0c…,9a2b…',
  })
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(MAX_PAGE_SIZE)
  @IsUUID('all', { each: true })
  ids?: string[];
}
