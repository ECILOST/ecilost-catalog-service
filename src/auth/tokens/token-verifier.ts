import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { CatalogConfig } from '../../config/catalog.config.js';
import { Principal } from '../domain/principal.js';
import type { Role } from '../domain/role.enum.js';

const ALG = 'RS256';

/**
 * Verifica el access token que emite ecilost-auth-service, en local y contra su JWKS.
 *
 * Preguntar a auth-service por cada peticion lo pondria en la ruta critica de la sala en
 * vivo y lo convertiria en lo primero que cae bajo carga. Su propia documentacion pide que
 * los demas servicios descarguen la llave una vez y verifiquen de este lado.
 */
@Injectable()
export class TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: CatalogConfig) {
    // Cachea el documento y solo lo revalida al ver un kid desconocido, con limite de
    // frecuencia. Asi una rotacion de llaves se absorbe sin reiniciar el servicio.
    this.jwks = createRemoteJWKSet(new URL(config.authJwksUrl), {
      cacheMaxAge: 3_600_000,
      cooldownDuration: 30_000,
    });
  }

  async verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
      // Fijar el algoritmo es obligatorio: aceptar el que declare la cabecera permitiria
      // firmar con HS256 usando la llave publica como secreto.
      algorithms: [ALG],
    });

    if (!payload.sub || typeof payload.role !== 'string') {
      throw new Error('claims incompletos en el access token');
    }
    return new Principal(payload.sub, payload.role as Role);
  }
}
