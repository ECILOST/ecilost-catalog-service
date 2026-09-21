import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

process.loadEnvFile?.(process.env.ENV_FILE ?? '.env');

const apply = process.argv.includes('--apply');
const graceHours = Number(process.env.MEDIA_ORPHAN_GRACE_HOURS ?? '24');
const databaseUrl = required('DATABASE_URL');
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl, { schema: schemaFrom(databaseUrl) }) });
const blobService = process.env.AZURE_STORAGE_CONNECTION_STRING
  ? BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
  : new BlobServiceClient(required('AZURE_STORAGE_ACCOUNT_URL'), new DefaultAzureCredential());
const container = blobService.getContainerClient(required('AZURE_STORAGE_CONTAINER'));

async function main(): Promise<void> {
  const keys = new Set((await prisma.mediaAsset.findMany({ select: { storageKey: true } })).map((x) => x.storageKey));
  const cutoff = Date.now() - graceHours * 60 * 60 * 1_000;
  let candidates = 0;
  for await (const blob of container.listBlobsFlat({ prefix: 'items/' })) {
    if (!blob.name || keys.has(blob.name) || (blob.properties.lastModified?.getTime() ?? Date.now()) > cutoff) continue;
    candidates += 1;
    if (apply) {
      await container.deleteBlob(blob.name);
      console.log(`ELIMINADO: ${blob.name}`);
    } else {
      console.log(`HUERFANO: ${blob.name}`);
    }
  }
  console.log(`${candidates} blobs huerfanos ${apply ? 'eliminados' : 'detectados'}.`);
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
