import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, disconnect } = vi.hoisted(() => ({
  findMany: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../src/generated/prisma/client.js', () => ({
  PrismaClient: class {
    mediaAsset = { findMany };
    $disconnect = disconnect;
  },
}));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
vi.mock('@azure/identity', () => ({ DefaultAzureCredential: class {} }));
vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: class {
    getContainerClient() {
      return { async *listBlobsFlat() {} };
    }
  },
}));
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: class {}, GetObjectCommand: class {} }));

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset().mockResolvedValue([]);
  disconnect.mockReset().mockResolvedValue(undefined);
  vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/catalog?schema=catalog_test');
  vi.stubEnv('AZURE_STORAGE_CONNECTION_STRING', '');
  vi.stubEnv('AZURE_STORAGE_ACCOUNT_URL', 'https://example.invalid');
  vi.stubEnv('AZURE_STORAGE_CONTAINER', 'test');
  for (const name of ['MINIO_S3_ENDPOINT', 'MINIO_S3_ACCESS_KEY', 'MINIO_S3_SECRET_KEY', 'MINIO_S3_BUCKET']) {
    vi.stubEnv(name, 'unused');
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.each([
  ['cleanup', () => import('./cleanup-azure-orphans.js')],
  ['migration', () => import('./migrate-minio-to-azure.js')],
] as const)('%s script completion', (_name, run) => {
  it('awaits successful work and database disconnection', async () => {
    await run();
    expect(findMany).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('propagates a work failure after disconnecting', async () => {
    const failure = new Error('Database query failed');
    findMany.mockRejectedValue(failure);
    await expect(run()).rejects.toThrow(failure);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('propagates a disconnection failure', async () => {
    const failure = new Error('Database disconnection failed');
    disconnect.mockRejectedValue(failure);
    await expect(run()).rejects.toThrow(failure);
  });
});
