import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { CatalogConfig } from '../../config/catalog.config.js';
import type { MediaStorage } from '../ports/media-storage.js';

/** Adaptador de Azure Blob Storage; el resto del dominio sigue usando MediaStorage. */
@Injectable()
export class AzureBlobMediaStorage implements MediaStorage, OnModuleInit {
  private readonly logger = new Logger(AzureBlobMediaStorage.name);
  private readonly service: BlobServiceClient;
  private readonly container;
  private readonly sharedKey?: StorageSharedKeyCredential;

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
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + ttlSeconds * 1_000);
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
          await this.service.getUserDelegationKey(startsOn, expiresOn),
          this.config.mediaAzureAccountName,
        ).toString();
    return `${this.container.getBlockBlobClient(key).url}?${signature}`;
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
