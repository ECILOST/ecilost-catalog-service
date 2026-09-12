import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, validateSync } from 'class-validator';

/**
 * Contrato de entorno del servicio. Se valida al arrancar, no en la primera peticion:
 * un DATABASE_URL ausente debe tumbar el proceso, no producir un 500 al registrar un objeto.
 */
export class EnvironmentVariables {
  @IsOptional() @IsString() NODE_ENV?: string;
  @IsOptional() @IsString() PORT?: string;

  @IsNotEmpty({ message: 'DATABASE_URL es obligatorio' })
  @IsString()
  DATABASE_URL: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Configuracion de entorno invalida:\n${detail}`);
  }
  return parsed;
}

/** Vista tipada de la configuracion. Evita esparcir strings de env por todo el codigo. */
export class CatalogConfig {
  readonly databaseUrl: string;
  readonly databaseSchema: string;

  constructor(env: EnvironmentVariables) {
    this.databaseUrl = env.DATABASE_URL;
    this.databaseSchema = readSchemaFromUrl(env.DATABASE_URL);
  }
}

/** El adaptador de driver de Prisma 7 no interpreta `?schema=`; hay que pasarselo aparte. */
function readSchemaFromUrl(url: string): string {
  try {
    return new URL(url).searchParams.get('schema') ?? 'public';
  } catch {
    return 'public';
  }
}
