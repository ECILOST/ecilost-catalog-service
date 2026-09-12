import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Principal } from '../../auth/domain/principal.js';
import type { TokenVerifier } from '../../auth/tokens/token-verifier.js';
import { JwtAuthGuard, type RequestWithPrincipal } from './jwt-auth.guard.js';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const STAFF = new Principal(USER_ID, 'STAFF');

/**
 * Doble del verificador. La mecanica del JWT ya la cubre token-verifier.spec.ts; aqui solo
 * interesa como reacciona el guard a que la verificacion pase o falle.
 */
function verifierThat(outcome: 'acepta' | 'rechaza'): TokenVerifier {
  return {
    verify: vi.fn(async () => {
      if (outcome === 'rechaza') throw new Error('token invalido');
      return STAFF;
    }),
  } as unknown as TokenVerifier;
}

function contextFor(request: Partial<RequestWithPrincipal>) {
  const response = { setHeader: vi.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(verifierThat('acepta'));
  });

  it('deja pasar un token valido e inyecta el Principal', async () => {
    const { context, request } = contextFor({
      headers: { authorization: 'Bearer un.token.valido' },
    } as Partial<RequestWithPrincipal>);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as RequestWithPrincipal).principal?.userId).toBe(USER_ID);
    expect((request as RequestWithPrincipal).principal?.role).toBe('STAFF');
  });

  it('responde 401 cuando no hay cabecera Authorization', async () => {
    const { context, response } = contextFor({ headers: {} } as Partial<RequestWithPrincipal>);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('Bearer'),
    );
  });

  it.each([
    ['esquema equivocado', 'Basic abc'],
    ['sin valor', 'Bearer'],
    ['con partes de mas', 'Bearer a b'],
  ])('responde 401 con una cabecera mal formada: %s', async (_caso, authorization) => {
    const { context } = contextFor({
      headers: { authorization },
    } as Partial<RequestWithPrincipal>);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('responde 401 con un token que no verifica', async () => {
    guard = new JwtAuthGuard(verifierThat('rechaza'));
    const { context, response } = contextFor({
      headers: { authorization: 'Bearer token.invalido.aqui' },
    } as Partial<RequestWithPrincipal>);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer error="invalid_token"',
    );
  });
});
