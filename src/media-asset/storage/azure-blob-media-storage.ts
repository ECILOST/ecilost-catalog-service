import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  type UserDelegationKey,
} from '@azure/storage-blob';
import { CatalogConfig } from '../../config/catalog.config.js';
import type { MediaStorage } from '../ports/media-storage.js';

/** Margen hacia atras del inicio de cada firma, por desfase de reloj con Azure. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Cuanto vive cada user delegation key que se pide a Azure. Azure admite hasta siete dias;
 * una hora alcanza para firmar cientos de enlaces de quince minutos con una sola llamada.
 */
export const DELEGATION_KEY_TTL_MS = 60 * 60 * 1000;

interface CachedDelegationKey {
  key: Promise<UserDelegationKey>;
  startsOn: number;
  expiresOn: number;
}

/** Adaptador de Azure Blob Storage; el resto del dominio sigue usando MediaStorage. */
@Injectable()
export class AzureBlobMediaStorage implements MediaStorage, OnModuleInit {
  private readonly logger = new Logger(AzureBlobMediaStorage.name);
  private readonly service: BlobServiceClient;
  private readonly container;
  private readonly sharedKey?: StorageSharedKeyCredential;
  private delegationKey?: CachedDelegationKey;

  constructor(private readonly config: CatalogConfig) {
    const connectionString = config.mediaAzureConnectionString;
    if (connectionString) {
      this.service = BlobServiceClient.fromConnectionString(connectionString);
      const accountKey = readConnectionStringValue(
        connectionString,
        'AccountKey',
      );
      if (accountKey) {
        this.sharedKey = new StorageSharedKeyCredential(
          config.mediaAzureAccountName,
          accountKey,
        );
      }
    } else {
      this.service = new BlobServiceClient(
        config.mediaAzureAccountUrl,
        new DefaultAzureCredential(),
      );
    }
    this.container = this.service.getContainerClient(
      config.mediaAzureContainer,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const result = await this.container.createIfNotExists();
      if (result.succeeded)
        this.logger.log(
          `Contenedor ${this.config.mediaAzureContainer} creado.`,
        );
    } catch (error) {
      this.logger.warn(
        `Azure Blob Storage no esta disponible: ${asMessage(error)}. ` +
          'Las subidas fallaran hasta que responda; el resto del catalogo funciona.',
      );
    }
  }

  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.container.getBlockBlobClient(key).uploadData(content, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  async remove(key: string): Promise<void> {
    // `deleteIfExists` conserva la semantica idempotente del puerto.
    await this.container.deleteBlobIfExists(key);
  }

  async signedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    const now = Date.now();
    // Arranca un poco en el pasado: si el reloj de Azure va detras del de este contenedor,
    // una firma que empieza "ahora" responde 403 sus primeros segundos y la foto recien
    // subida sale rota. La caducidad sigue contandose desde ahora.
    const startsOn = new Date(now - CLOCK_SKEW_MS);
    const expiresOn = new Date(now + ttlSeconds * 1_000);
    const values = {
      containerName: this.config.mediaAzureContainer,
      blobName: key,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
    };
    const signature = this.sharedKey
      ? generateBlobSASQueryParameters(values, this.sharedKey).toString()
      : generateBlobSASQueryParameters(
          values,
          await this.userDelegationKey(startsOn.getTime(), expiresOn.getTime()),
          this.config.mediaAzureAccountName,
        ).toString();
    return `${this.container.getBlockBlobClient(key).url}?${signature}`;
  }

  /**
   * La user delegation key con que se firman los enlaces, reutilizada mientras cubra la
   * firma que se va a hacer. Antes se pedia una a Azure por cada enlace nuevo: una llamada
   * de red mas por fotografia. Se guarda la promesa, para que varias firmas simultaneas
   * compartan una sola peticion; si falla, se olvida y la siguiente firma la vuelve a pedir.
   */
  private userDelegationKey(
    startsOn: number,
    expiresOn: number,
  ): Promise<UserDelegationKey> {
    const cached = this.delegationKey;
    // Una firma no puede empezar antes ni terminar despues que la llave que la respalda.
    if (
      cached &&
      cached.startsOn <= startsOn &&
      cached.expiresOn >= expiresOn
    ) {
      return cached.key;
    }

    const keyStartsOn = startsOn;
    const keyExpiresOn = Math.max(
      expiresOn,
      Date.now() + DELEGATION_KEY_TTL_MS,
    );
    const entry: CachedDelegationKey = {
      startsOn: keyStartsOn,
      expiresOn: keyExpiresOn,
      key: this.service
        .getUserDelegationKey(new Date(keyStartsOn), new Date(keyExpiresOn))
        .catch((error: unknown) => {
          if (this.delegationKey === entry) this.delegationKey = undefined;
          throw error;
        }),
    };
    this.delegationKey = entry;
    return entry.key;
  }
}

function readConnectionStringValue(
  connectionString: string,
  name: string,
): string | undefined {
  const prefix = `${name}=`;
  return connectionString
    .split(';')
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
