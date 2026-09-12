import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Principal } from '../../auth/domain/principal.js';
import { TokenVerifier } from '../../auth/tokens/token-verifier.js';

/** El Principal autenticado, adosado a la peticion por el guard. */
export interface RequestWithPrincipal extends Request {
  principal?: Principal;
}

/**
 * Sin sesion valida, 401.
 *
 * Verifica la firma contra la JWKS publicada por ecilost-auth-service, sin llamarlo en
 * cada peticion. Es el mismo guard que aplica auth-service en su propio `GET /auth/me`,
 * que es la referencia que los demas servicios deben seguir.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithPrincipal>();
    const response = http.getResponse<Response>();

    const token = readBearerToken(request);
    if (!token) {
      return this.reject(response, 'invalid_request', 'Falta el token de acceso.');
    }

    try {
      request.principal = await this.tokens.verify(token);
      return true;
    } catch {
      return this.reject(response, 'invalid_token', 'El token de acceso no es valido.');
    }
  }

  /** RFC 6750: un 401 de recurso protegido debe decir como autenticarse. */
  private reject(response: Response, error: string, message: string): never {
    response.setHeader('WWW-Authenticate', `Bearer error="${error}"`);
    throw new UnauthorizedException(message);
  }
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value, ...rest] = header.split(' ');
  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value;
}
