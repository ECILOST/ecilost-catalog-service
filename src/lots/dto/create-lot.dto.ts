import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLotDto {
  @ApiProperty({ example: 'Kit de electronica extraviada', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'Identificadores de objetos disponibles. Un lote requiere al menos dos.', type: [String], minItems: 2, format: 'uuid' })
  @IsArray()
  @ArrayMinSize(2, { message: 'itemIds debe contener al menos dos objetos.' })
  @ArrayUnique({ message: 'itemIds no puede repetir un objeto.' })
  @IsUUID('4', { each: true })
  itemIds: string[];
}
