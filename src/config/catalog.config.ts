import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

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

  /** JWKS de ecilost-auth-service. Se descarga una vez y se cachea. */
  @IsUrl({ require_tld: false }) AUTH_JWKS_URL: string;

  /** Deben coincidir con los del emisor, o ningun token verificara. */
  @IsNotEmpty() @IsString() JWT_ISSUER: string;
  @IsNotEmpty() @IsString() JWT_AUDIENCE: string;

  /** Azure Blob Storage. En Azure se usa identidad administrada; Azurite usa connection string. */
  @IsNotEmpty() @IsString() AZURE_STORAGE_ACCOUNT_NAME: string;
  @IsNotEmpty() @IsString() AZURE_STORAGE_CONTAINER: string;
  @IsOptional()
  @IsUrl({ require_tld: false })
  AZURE_STORAGE_ACCOUNT_URL?: string;
  @IsOptional() @IsString() AZURE_STORAGE_CONNECTION_STRING?: string;
  @IsNotEmpty() @IsString() RABBITMQ_URL: string;
}

export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Configuracion de entorno invalida:\n${detail}`);
  }
  if (
    !parsed.AZURE_STORAGE_CONNECTION_STRING &&
    !parsed.AZURE_STORAGE_ACCOUNT_URL
  ) {
    throw new Error(
      'Configuracion de entorno invalida:\n' +
        '  - AZURE_STORAGE_ACCOUNT_URL o AZURE_STORAGE_CONNECTION_STRING es obligatorio',
    );
  }
  return parsed;
}

/** Vista tipada de la configuracion. Evita esparcir strings de env por todo el codigo. */
export class CatalogConfig {
  readonly databaseUrl: string;
  readonly databaseSchema: string;
  readonly authJwksUrl: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly mediaAzureAccountName: string;
  readonly mediaAzureContainer: string;
  readonly mediaAzureAccountUrl: string;
  readonly mediaAzureConnectionString?: string;
  readonly rabbitmqUrl: string;

  constructor(env: EnvironmentVariables) {
    this.databaseUrl = env.DATABASE_URL;
    this.databaseSchema = readSchemaFromUrl(env.DATABASE_URL);
    this.authJwksUrl = env.AUTH_JWKS_URL;
    this.jwtIssuer = env.JWT_ISSUER;
    this.jwtAudience = env.JWT_AUDIENCE;
    this.mediaAzureAccountName = env.AZURE_STORAGE_ACCOUNT_NAME;
    this.mediaAzureContainer = env.AZURE_STORAGE_CONTAINER;
    this.mediaAzureAccountUrl = env.AZURE_STORAGE_ACCOUNT_URL ?? '';
    this.mediaAzureConnectionString = env.AZURE_STORAGE_CONNECTION_STRING;
    this.rabbitmqUrl = env.RABBITMQ_URL;
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
