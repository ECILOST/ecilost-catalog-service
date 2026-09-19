import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Un DELETE con cuerpo lo soportan mal clientes y proxies, asi que la version viaja en la
 * consulta. Obligatoria: sin ella el borrado seria la unica escritura del servicio sin
 * control de concurrencia.
 */
export class DeleteItemQueryDto {
  @ApiProperty({
    description: 'Version que leiste en el GET. Si ya no es la vigente, la respuesta es 409.',
    example: 0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt({ message: 'version es obligatorio y debe ser un entero' })
  @Min(0)
  version: number;
}
