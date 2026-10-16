import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export const MAX_CLUES = 5;
export const CLUE_MAX_LENGTH = 60;

/**
 * Pistas del lote misterioso (ADR-0002): frases cortas que no delatan el objeto, como
 * "Encontrado en bloque G". Se recortan y se descartan las vacias antes de validar.
 */
export function Clues() {
  return applyDecorators(
    ApiPropertyOptional({
      type: [String],
      maxItems: MAX_CLUES,
      description:
        'Pistas para el lote misterioso: lo unico que vera el estudiante, junto a la categoria y la ' +
        'condicion, si la ruleta oculta el objeto. No deben delatarlo.',
      example: ['Encontrado en bloque G', 'Funciona con bateria'],
    }),
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      Array.isArray(value)
        ? value.map((clue) => (typeof clue === 'string' ? clue.trim() : clue)).filter((clue) => clue !== '')
        : value,
    ),
    IsArray({ message: 'clues debe ser una lista' }),
    ArrayMaxSize(MAX_CLUES, { message: `Se admiten como maximo ${MAX_CLUES} pistas` }),
    IsString({ each: true, message: 'Cada pista debe ser texto' }),
    MaxLength(CLUE_MAX_LENGTH, { each: true, message: `Cada pista admite como maximo ${CLUE_MAX_LENGTH} caracteres` }),
  );
}
