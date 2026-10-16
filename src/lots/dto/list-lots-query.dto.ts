import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import {
  commaList,
  MAX_PAGE_SIZE,
} from '../../items/dto/list-items-query.dto.js';

/** Filtros de `GET /lots`. Sin ninguno responde todos, como siempre. */
export class ListLotsQueryDto {
  @ApiPropertyOptional({
    description: `Solo estos lotes, separados por comas (hasta ${MAX_PAGE_SIZE}).`,
  })
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(MAX_PAGE_SIZE)
  @IsUUID('all', { each: true })
  ids?: string[];
}
