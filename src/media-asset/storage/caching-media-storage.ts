import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { MediaStorage } from '../ports/media-storage.js';

/**
 * Decorador del almacen que estabiliza los enlaces de lectura (HU-08).
 *
 * ## Por que hace falta
 *
 * Una firma de S3 lleva dentro el instante en que se produjo, con precision de segundo.
 * Firmar dos veces el mismo archivo con un segundo de diferencia da dos URL distintas que
 * apuntan al mismo contenido. Eso rompe dos cosas:
 *
 * 1. El criterio 2 de la HU-08. Varios estudiantes abriendo la misma ficha reciben
 *    respuestas que no son iguales, aunque el objeto que describen si lo sea.
 * 2. La cache del navegador. Un video de cincuenta megabytes con una URL nueva en cada
 *    apertura se vuelve a descargar entero cada vez, porque para el navegador es otro
 *    recurso.
 *
 * Guardar la firma resuelve las dos: mientras la entrada siga viva, todos los lectores
 * reciben exactamente la misma URL.
 *
 * ## Por que es un decorador y no codigo dentro del adaptador de S3
 *
 * Cachear no es asunto de S3: es una politica sobre el puerto. Puesta aqui vale para
 * cualquier adaptador que venga despues, se prueba con un doble y sin almacen, y deja al
 * adaptador de S3 haciendo una sola cosa.
 */

/** Entrada viva de la cache. Se guarda la promesa, no la URL: ver `signedReadUrl`. */
interface CachedUrl {
  url: Promise<string>;
  /** Instante a partir del cual la entrada deja de servirse. */
  staleAt: number;
}

/**
 * Margen que se le resta al tiempo de vida antes de volver a firmar.
 *
 * Una URL servida justo antes de caducar le llega al navegador ya inservible. Reservar el
 * ultimo minuto garantiza que todo enlace entregado aguante al menos ese minuto.
 */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Tope de entradas. La cache crece con los objetos que se consultan, no con los que
 * existen, pero un catalogo grande y muchas visitas la dejarian creciendo sin limite.
 */
const MAX_ENTRIES = 1_000;

@Injectable()
export class CachingMediaStorage implements MediaStorage, OnModuleInit {
  private readonly logger = new Logger(CachingMediaStorage.name);
  private readonly cache = new Map<string, CachedUrl>();

  constructor(private readonly inner: MediaStorage) {}

  /**
   * Reenvia el arranque al almacen envuelto.
   *
   * El puerto no declara ciclo de vida, porque cachear o firmar no lo necesitan, pero el
   * adaptador de S3 aprovecha el suyo para comprobar el bucket. Al quedar dentro de esta
   * envoltura, Nest ya no lo ve, asi que el gancho se pasa a mano.
   */
  async onModuleInit(): Promise<void> {
    await (this.inner as Partial<OnModuleInit>).onModuleInit?.();
  }

  /**
   * Devuelve la misma URL a todo el que pregunte, mientras la entrada siga viva.
   *
   * Se guarda la **promesa** y no la URL ya resuelta. Es lo que hace que varias peticiones
   * simultaneas del mismo archivo produzcan una sola firma: la primera deja la promesa en
   * la cache antes de terminar, y las demas se enganchan a ella en vez de abrir su propia
   * firma. Guardar el valor resuelto dejaria una ventana, entre que empieza la firma y
   * termina, en la que cada peticion abriria la suya.
   */
  signedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    const vigente = this.cache.get(key);
    if (vigente && vigente.staleAt > Date.now()) return vigente.url;

    const url = this.inner.signedReadUrl(key, ttlSeconds).catch((error: unknown) => {
      // Una firma fallida no se queda cacheada: si no se retira, el fallo se repetiria
      // durante todo el tiempo de vida de la entrada aunque el almacen ya haya vuelto.
      this.evict(key);
      throw error;
    });

    this.sweep();
    this.cache.set(key, {
      url,
      staleAt: Date.now() + Math.max(ttlSeconds * 1000 - EXPIRY_MARGIN_MS, 0),
    });
    return url;
  }

  /** El contenido cambio, asi que la firma anterior apunta a otra cosa. */
  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.inner.put(key, content, contentType);
    this.evict(key);
  }

  /** El archivo ya no esta: conservar su enlace solo serviria para entregar un 404. */
  async remove(key: string): Promise<void> {
    try {
      await this.inner.remove(key);
    } finally {
      // Se retira pase lo que pase. Si el borrado fallo, la entrada tampoco es de fiar.
      this.evict(key);
    }
  }

  private evict(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Retira lo caducado y, si aun asi no cabe, lo mas antiguo.
   *
   * Corre en cada firma nueva y no en un temporizador: un intervalo mantendria vivo el
   * proceso y habria que pararlo al cerrar la aplicacion, que es mas maquinaria de la que
   * merece una cache de este tamano.
   */
  private sweep(): void {
    const ahora = Date.now();
    for (const [key, entrada] of this.cache) {
      if (entrada.staleAt <= ahora) this.cache.delete(key);
    }

    if (this.cache.size < MAX_ENTRIES) return;

    // Map conserva el orden de insercion, asi que las primeras claves son las mas viejas.
    const sobran = this.cache.size - MAX_ENTRIES + 1;
    for (const key of [...this.cache.keys()].slice(0, sobran)) this.cache.delete(key);
    this.logger.warn(`Cache de enlaces llena: se retiraron ${sobran} entradas antiguas.`);
  }
}
