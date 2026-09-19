import { CatalogConfig, type EnvironmentVariables } from '../../src/config/catalog.config.js';

export const TEST_JWKS_URL = 'http://auth.test/.well-known/jwks.json';
export const TEST_ISSUER = 'https://auth.ecilost.test';
export const TEST_AUDIENCE = 'ecilost-services';

/** Configuracion de prueba. No toca .env: las unitarias no deben depender del entorno. */
export function buildTestConfig(overrides: Partial<EnvironmentVariables> = {}): CatalogConfig {
  return new CatalogConfig({
    DATABASE_URL:
      'postgresql://ecilost:ecilost@localhost:5434/ecilost_catalog?schema=catalog_test',
    AUTH_JWKS_URL: TEST_JWKS_URL,
    JWT_ISSUER: TEST_ISSUER,
    JWT_AUDIENCE: TEST_AUDIENCE,
    ...overrides,
  } as EnvironmentVariables);
}
