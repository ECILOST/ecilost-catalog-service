import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProblemType } from '../http/problem-details.js';

/**
 * Solo describe el cuerpo de error en OpenAPI. Lo que se envia de verdad lo construye
 * ProblemDetailsFilter.
 */
export class ProblemDetailsDto {
  @ApiProperty({
    enum: Object.values(ProblemType),
    description:
      'Identificador estable del problema. Es sobre esto que un cliente debe ramificar, ' +
      'no sobre el texto de `title` ni de `detail`.',
    example: ProblemType.VALIDATION,
  })
  type: string;

  @ApiProperty({ description: 'Resumen legible, constante para un mismo `type`.' })
  title: string;

  @ApiProperty({ example: 400 })
  status: number;

  @ApiPropertyOptional({ description: 'Detalle de esta ocurrencia concreta.' })
  detail?: string;

  @ApiPropertyOptional({ description: 'Ruta sobre la que ocurrio.', example: '/items' })
  instance?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Presente en un 400: que campos fallaron y por que.',
    example: ['name es obligatorio', 'category es obligatorio'],
  })
  errors?: string[];
}
