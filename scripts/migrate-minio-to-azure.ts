import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

process.loadEnvFile?.(process.env.ENV_FILE ?? '.env');

const apply = process.argv.includes('--apply');
const databaseUrl = required('DATABASE_URL');
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl, { schema: schemaFrom(databaseUrl) }) });
const minio = new S3Client({
  endpoint: required('MINIO_S3_ENDPOINT'),
  region: process.env.MINIO_S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: required('MINIO_S3_ACCESS_KEY'), secretAccessKey: required('MINIO_S3_SECRET_KEY') },
});
const sourceBucket = required('MINIO_S3_BUCKET');
const blobService = process.env.AZURE_STORAGE_CONNECTION_STRING
  ? BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
  : new BlobServiceClient(required('AZURE_STORAGE_ACCOUNT_URL'), new DefaultAzureCredential());
const container = blobService.getContainerClient(required('AZURE_STORAGE_CONTAINER'));

async function main(): Promise<void> {
  const assets = await prisma.mediaAsset.findMany({
    select: { id: true, storageKey: true, contentType: true, sizeBytes: true },
    orderBy: { uploadedAt: 'asc' },
  });
  console.log(`${apply ? 'Migrando' : 'Simulando'} ${assets.length} archivos de MinIO a Azure Blob Storage.`);

  if (apply) await container.createIfNotExists();
  for (const asset of assets) {
    const destination = container.getBlockBlobClient(asset.storageKey);
    const properties = await destination.getProperties().catch(() => undefined);
    if (properties?.contentLength === asset.sizeBytes) {
      console.log(`OK existente: ${asset.storageKey}`);
      continue;
    }
    if (!apply) {
      console.log(`COPIAR: ${asset.storageKey}`);
      continue;
    }

    const source = await minio.send(new GetObjectCommand({ Bucket: sourceBucket, Key: asset.storageKey }));
    if (!source.Body) throw new Error(`MinIO devolvio un objeto sin cuerpo: ${asset.storageKey}`);
    const bytes = await source.Body.transformToByteArray();
    if (bytes.byteLength !== asset.sizeBytes) {
      throw new Error(`Tamano inesperado para ${asset.storageKey}: ${bytes.byteLength}/${asset.sizeBytes}`);
    }
    await destination.uploadData(bytes, { blobHTTPHeaders: { blobContentType: asset.contentType } });
    console.log(`MIGRADO: ${asset.storageKey}`);
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio`);
  return value;
}

function schemaFrom(url: string): string {
  return new URL(url).searchParams.get('schema') ?? 'public';
}

main().finally(() => prisma.$disconnect());
