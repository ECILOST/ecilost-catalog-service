/**
 * Puerto de salida hacia el almacen de objetos, donde viven los bytes.
 *
 * La base guarda la referencia y este puerto guarda el archivo. Separarlos es lo que
 * permite cambiar de almacen sin tocar el caso de uso: contra uno que hable el protocolo
 * de S3 basta con cambiar variables de entorno, y contra uno que no lo hable, como Azure
 * Blob Storage, se escribe otra clase que implemente estas tres operaciones. Es tambien lo
 * que permite que las pruebas no necesiten ningun almacen levantado.
 *
 * El puerto tiene forma de dominio: tres operaciones sobre una clave. Nada de buckets,
 * regiones ni tipos del SDK, que son asunto del adaptador.
 */
export interface MediaStorage {
  /** Escribe el archivo bajo esa clave. Sobrescribe si ya existia. */
  put(key: string, content: Buffer, contentType: string): Promise<void>;

  /** Retira el archivo. Es idempotente: borrar lo que ya no esta no es un error. */
  remove(key: string): Promise<void>;

  /**
   * URL de lectura de vida corta.
   *
   * El navegador baja los bytes del almacen directamente, sin pasar por este servicio ni
   * por el API Gateway. Es lo que evita que varios estudiantes viendo el mismo video
   * compitan por el event loop de Node, que es el tercer criterio de la HU-08.
   */
  signedReadUrl(key: string, ttlSeconds: number): Promise<string>;
}

export const MEDIA_STORAGE = Symbol('MediaStorage');
