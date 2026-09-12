import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ItemCondition } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Alta de un objeto perdido (HU-03).
 *
 * No acepta `status`: el criterio dice que el objeto nace Disponible, y dejar que el
 * cliente lo escriba permitiria registrar algo ya marcado como vendido. Tampoco acepta
 * fotografias, que son de la HU-07 y se adjuntan despues contra el objeto ya creado.
 */
export class CreateItemDto {
  @ApiProperty({
    description: 'Nombre corto con el que se reconoce el objeto.',
    maxLength: 120,
    example: 'Portatil Lenovo ThinkPad',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Descripcion detallada: senas particulares, contenido, donde aparecio.',
    maxLength: 2000,
    example: 'Carcasa negra con una calcomania de la universidad en la tapa.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'description es obligatorio' })
  @MaxLength(2000)
  description: string;

  @ApiProperty({
    enum: Object.values(ItemCondition),
    description:
      'Condicion fisica declarada por el funcionario. Es lo que el estudiante consulta ' +
      'antes de pujar, asi que describe el objeto, no su disponibilidad.',
    example: ItemCondition.GOOD,
  })
  @IsEnum(ItemCondition, {
    message: `condition es obligatorio y debe ser uno de: ${Object.values(ItemCondition).join(', ')}`,
  })
  condition: ItemCondition;

  @ApiProperty({
    description: 'Categoria del objeto. Sirve para armar rondas por tipo.',
    maxLength: 60,
    example: 'Electronica',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'category es obligatorio' })
  @MaxLength(60)
  category: string;
}
