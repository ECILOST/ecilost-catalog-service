import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { TokenVerifier } from './tokens/token-verifier.js';

/**
 * Verificacion de sesion para todo el servicio. Es @Global porque cualquier modulo de
 * negocio puede necesitar proteger un endpoint, y no tiene estado propio que aislar.
 */
@Global()
@Module({
  providers: [TokenVerifier, JwtAuthGuard, RolesGuard],
  exports: [TokenVerifier, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
