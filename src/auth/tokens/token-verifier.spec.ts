import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildTestConfig,
  TEST_AUDIENCE,
  TEST_ISSUER,
} from '../../../test/helpers/test-config.js';
import { TokenVerifier } from './token-verifier.js';

const ALG = 'RS256';
const USER_ID = '11111111-1111-4111-8111-111111111111';

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let kid: string;
/** Segundo par, para simular un token firmado por otro emisor. */
let intruderKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair(ALG, { extractable: true });
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  kid = await calculateJwkThumbprint(await exportJWK(publicKey));

  const other = await generateKeyPair(ALG, { extractable: true });
  intruderKey = other.privateKey;
});

/** Sirve la JWKS del emisor sin salir a la red, igual que la publica auth-service. */
async function serveJwks(): Promise<void> {
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: ALG, use: 'sig' };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

interface TokenOptions {
  issuer?: string;
  audience?: string;
  role?: string | null;
  expiresIn?: string;
  key?: CryptoKey;
}

/** Reproduce exactamente lo que firma TokenService en ecilost-auth-service. */
function signToken(options: TokenOptions = {}): Promise<string> {
  const claims = options.role === null ? {} : { role: options.role ?? 'STAFF' };

  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, kid, typ: 'JWT' })
    .setSubject(USER_ID)
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? TEST_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '900s')
    .sign(options.key ?? privateKey);
}

function newVerifier(): TokenVerifier {
  // Uno nuevo por prueba: cada instancia tiene su propia cache de la JWKS.
  return new TokenVerifier(buildTestConfig());
}

describe('TokenVerifier', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('acepta un token bien firmado y devuelve el Principal', async () => {
    await serveJwks();

    const principal = await newVerifier().verify(await signToken());

    expect(principal.userId).toBe(USER_ID);
    expect(principal.role).toBe('STAFF');
    expect(principal.canManageCatalog()).toBe(true);
  });

  it('distingue al estudiante, que no administra el catalogo', async () => {
    await serveJwks();

    const principal = await newVerifier().verify(await signToken({ role: 'STUDENT' }));

    expect(principal.canManageCatalog()).toBe(false);
  });

  it('rechaza un token de otro emisor', async () => {
    await serveJwks();

    await expect(
      newVerifier().verify(await signToken({ issuer: 'https://impostor.local' })),
    ).rejects.toThrow();
  });

  it('rechaza un token dirigido a otra audiencia', async () => {
    await serveJwks();

    await expect(
      newVerifier().verify(await signToken({ audience: 'otra-plataforma' })),
    ).rejects.toThrow();
  });

  it('rechaza un token expirado', async () => {
    await serveJwks();

    await expect(newVerifier().verify(await signToken({ expiresIn: '-1s' }))).rejects.toThrow();
  });

  it('rechaza un token firmado con otra llave', async () => {
    // La firma no valida contra la JWKS publicada, aunque el kid diga lo contrario.
    await serveJwks();

    await expect(newVerifier().verify(await signToken({ key: intruderKey }))).rejects.toThrow();
  });

  it('rechaza un token sin el claim role', async () => {
    // Sin rol no se puede decidir nada: dejarlo pasar equivaldria a conceder el acceso.
    await serveJwks();

    await expect(newVerifier().verify(await signToken({ role: null }))).rejects.toThrow(
      /claims incompletos/,
    );
  });

  it('rechaza texto que no es un JWT', async () => {
    await serveJwks();

    await expect(newVerifier().verify('esto.no.es')).rejects.toThrow();
  });
});
