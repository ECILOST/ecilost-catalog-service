import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaStorage } from '../ports/media-storage.js';
import { CachingMediaStorage } from './caching-media-storage.js';

const TTL = 900;
const CLAVE = 'items/abc/def.jpg';

/**
 * Almacen de mentira que firma distinto cada vez, como hace S3 de verdad: la firma lleva
 * dentro el instante en que se produjo. Si el decorador no cachea, se nota aqui.
 */
class AlmacenQueFirmaDistinto implements MediaStorage {
  firmas = 0;
  borrados: string[] = [];
  escrituras: string[] = [];
  fallarAlFirmar = false;
  fallarAlBorrar = false;

  async put(key: string, _c: Buffer, _t: string): Promise<void> {
    this.escrituras.push(key);
  }

  async remove(key: string): Promise<void> {
    if (this.fallarAlBorrar) throw new Error('el almacen no responde');
    this.borrados.push(key);
  }

  async signedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    this.firmas += 1;
    // Cede el turno antes de resolver, para que varias llamadas simultaneas se solapen de
    // verdad y no se resuelvan uno detras de otro.
    await Promise.resolve();
    if (this.fallarAlFirmar) throw new Error('el almacen no responde');
    return `https://almacen.test/${key}?firma=${this.firmas}&ttl=${ttlSeconds}`;
  }
}

describe('CachingMediaStorage', () => {
  let inner: AlmacenQueFirmaDistinto;
  let storage: CachingMediaStorage;

  beforeEach(() => {
    vi.useRealTimers();
    inner = new AlmacenQueFirmaDistinto();
    storage = new CachingMediaStorage(inner);
  });

  describe('estabilidad del enlace (HU-08, criterio 2)', () => {
    it('dos lecturas seguidas del mismo archivo dan la misma URL', async () => {
      const primera = await storage.signedReadUrl(CLAVE, TTL);
      const segunda = await storage.signedReadUrl(CLAVE, TTL);

      expect(segunda).toBe(primera);
      expect(inner.firmas).toBe(1);
    });

    it('sin la cache el almacen devolveria URL distintas', async () => {
      // Comprobacion de que el doble reproduce el comportamiento real de S3, para que la
      // prueba de arriba signifique algo.
      expect(await inner.signedReadUrl(CLAVE, TTL)).not.toBe(
        await inner.signedReadUrl(CLAVE, TTL),
      );
    });

    it('veinte lectores simultaneos reciben la misma URL y se firma una sola vez', async () => {
      const urls = await Promise.all(
        Array.from({ length: 20 }, () => storage.signedReadUrl(CLAVE, TTL)),
      );

      expect(new Set(urls).size).toBe(1);
      // Lo interesante del caso concurrente: la firma no se repite veinte veces. La
      // primera deja su promesa en la cache y las demas se enganchan a ella.
      expect(inner.firmas).toBe(1);
    });

    it('archivos distintos no comparten entrada', async () => {
      const a = await storage.signedReadUrl('items/a/1.jpg', TTL);
      const b = await storage.signedReadUrl('items/b/2.jpg', TTL);

      expect(a).not.toBe(b);
      expect(inner.firmas).toBe(2);
    });
  });

  describe('vigencia', () => {
    it('vuelve a firmar cuando la entrada se acerca a su caducidad', async () => {
      // Un tiempo de vida por debajo del margen deja la entrada obsoleta al instante.
      const primera = await storage.signedReadUrl(CLAVE, 30);
      const segunda = await storage.signedReadUrl(CLAVE, 30);

      expect(segunda).not.toBe(primera);
      expect(inner.firmas).toBe(2);
    });

    it('reserva un margen para que el enlace entregado no caduque en el camino', async () => {
      // Con 15 minutos de vida la entrada se sirve; con 30 segundos, no. La diferencia es
      // el margen: una URL servida al filo le llegaria inservible al navegador.
      await storage.signedReadUrl(CLAVE, TTL);
      await storage.signedReadUrl(CLAVE, TTL);
      expect(inner.firmas).toBe(1);
    });
  });

  describe('invalidacion', () => {
    it('escribir el archivo retira su enlace, porque el contenido cambio', async () => {
      const antes = await storage.signedReadUrl(CLAVE, TTL);

      await storage.put(CLAVE, Buffer.from('nuevo'), 'image/jpeg');

      expect(await storage.signedReadUrl(CLAVE, TTL)).not.toBe(antes);
      expect(inner.escrituras).toEqual([CLAVE]);
    });

    it('borrar el archivo retira su enlace', async () => {
      await storage.signedReadUrl(CLAVE, TTL);

      await storage.remove(CLAVE);

      await storage.signedReadUrl(CLAVE, TTL);
      expect(inner.firmas).toBe(2);
      expect(inner.borrados).toEqual([CLAVE]);
    });

    it('un borrado fallido tambien retira el enlace', async () => {
      // Si el borrado fallo no sabemos si el archivo sigue ahi, asi que la entrada
      // cacheada deja de ser de fiar igual.
      await storage.signedReadUrl(CLAVE, TTL);
      inner.fallarAlBorrar = true;

      await expect(storage.remove(CLAVE)).rejects.toThrow();

      await storage.signedReadUrl(CLAVE, TTL);
      expect(inner.firmas).toBe(2);
    });
  });

  describe('fallos al firmar', () => {
    it('no cachea el fallo: el siguiente intento vuelve a preguntar', async () => {
      inner.fallarAlFirmar = true;
      await expect(storage.signedReadUrl(CLAVE, TTL)).rejects.toThrow();

      // Si el fallo se hubiera quedado guardado, este intento devolveria el mismo error
      // durante los proximos quince minutos aunque el almacen ya haya vuelto.
      inner.fallarAlFirmar = false;
      await expect(storage.signedReadUrl(CLAVE, TTL)).resolves.toContain('almacen.test');
      expect(inner.firmas).toBe(2);
    });

    it('el fallo llega a todos los que esperaban esa misma firma', async () => {
      inner.fallarAlFirmar = true;

      const intentos = await Promise.allSettled(
        Array.from({ length: 5 }, () => storage.signedReadUrl(CLAVE, TTL)),
      );

      expect(intentos.every((i) => i.status === 'rejected')).toBe(true);
      expect(inner.firmas).toBe(1);
    });
  });
});
