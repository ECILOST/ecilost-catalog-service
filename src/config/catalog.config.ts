import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, validateSync } from 'class-validator';

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

  /**
   * Almacen de objetos donde viven las fotografias y el video (HU-07).
   *
   * Solo datos de conexion. Los limites de tamano y de cantidad no estan aqui porque
   * describen el producto y no el despliegue: viven en `media-asset/domain/media-policy.ts`.
   */
  @IsUrl({ require_tld: false }) MEDIA_S3_ENDPOINT: string;
  @IsNotEmpty() @IsString() MEDIA_S3_REGION: string;
  @IsNotEmpty() @IsString() MEDIA_S3_BUCKET: string;
  @IsNotEmpty() @IsString() MEDIA_S3_ACCESS_KEY: string;
  @IsNotEmpty() @IsString() MEDIA_S3_SECRET_KEY: string;
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
  readonly authJwksUrl: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly mediaEndpoint: string;
  readonly mediaRegion: string;
  readonly mediaBucket: string;
  readonly mediaAccessKey: string;
  readonly mediaSecretKey: string;

  constructor(env: EnvironmentVariables) {
    this.databaseUrl = env.DATABASE_URL;
    this.databaseSchema = readSchemaFromUrl(env.DATABASE_URL);
    this.authJwksUrl = env.AUTH_JWKS_URL;
    this.jwtIssuer = env.JWT_ISSUER;
    this.jwtAudience = env.JWT_AUDIENCE;
    this.mediaEndpoint = env.MEDIA_S3_ENDPOINT;
    this.mediaRegion = env.MEDIA_S3_REGION;
    this.mediaBucket = env.MEDIA_S3_BUCKET;
    this.mediaAccessKey = env.MEDIA_S3_ACCESS_KEY;
    this.mediaSecretKey = env.MEDIA_S3_SECRET_KEY;
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
