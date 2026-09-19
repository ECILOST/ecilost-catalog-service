import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CatalogConfig } from '../../config/catalog.config.js';
import type { MediaStorage } from '../ports/media-storage.js';

/**
 * Adaptador del almacen de objetos.
 *
 * Habla el protocolo de S3, que entienden MinIO, AWS S3, Cloudflare R2 y DigitalOcean
 * Spaces. Moverse entre esos es cambiar variables de entorno, no esta clase: por eso el
 * puerto no menciona buckets ni regiones.
 *
 * Azure Blob Storage NO habla S3, aunque cubra la misma necesidad. Desplegar alli pediria
 * una clase hermana sobre `@azure/storage-blob` que implemente el mismo puerto. Nada mas
 * cambiaria: ni el caso de uso, ni el controlador, ni las pruebas.
 *
 * Es la unica clase del servicio que importa el SDK. Si manana el almacen fuera otro,
 * seria la unica que habria que reescribir.
 */
@Injectable()
export class S3MediaStorage implements MediaStorage, OnModuleInit {
  private readonly logger = new Logger(S3MediaStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: CatalogConfig) {
    this.bucket = config.mediaBucket;
    this.client = new S3Client({
      endpoint: config.mediaEndpoint,
      region: config.mediaRegion,
      // MinIO sirve los buckets como ruta y no como subdominio. Sin esto el SDK firmaria
      // contra `bucket.localhost`, que no resuelve.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.mediaAccessKey,
        secretAccessKey: config.mediaSecretKey,
      },
    });
  }

  /**
   * Avisa al arrancar si el almacen no esta listo, y crea el bucket si solo faltaba el.
   *
   * Un fallo aqui no impide arrancar a proposito. El catalogo sigue sirviendo el listado y
   * la edicion de objetos aunque el almacen este caido: tumbar el servicio entero por eso
   * cambiaria un fallo parcial por uno total. Lo que si hace es dejarlo dicho en el log, en
   * vez de esperar a que un funcionario lo descubra subiendo una foto.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      this.logger.warn(
        `El bucket ${this.bucket} no responde. Se intenta crear.`,
      );
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket ${this.bucket} creado.`);
    } catch (error) {
      this.logger.warn(
        `El almacen de multimedia no esta disponible: ${asMessage(error)}. ` +
          'Las subidas fallaran hasta que responda; el resto del catalogo funciona.',
      );
    }
  }

  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    // S3 responde 204 aunque la clave no exista: borrar lo que ya no esta no es un error.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  signedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
