import { describe, expect, it, vi } from 'vitest';
import type { CatalogConfig } from '../../config/catalog.config.js';
import {
  AzureBlobMediaStorage,
  CLOCK_SKEW_MS,
  DELEGATION_KEY_TTL_MS,
} from './azure-blob-media-storage.js';

// La llave publica y documentada de Azurite: firmar no sale a la red.
const AZURITE =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;';

const storage = () =>
  new AzureBlobMediaStorage({
    mediaAzureConnectionString: AZURITE,
    mediaAzureAccountName: 'devstoreaccount1',
    mediaAzureContainer: 'catalog-media',
  } as CatalogConfig);

describe('AzureBlobMediaStorage.signedReadUrl', () => {
  it('empieza la firma en el pasado, para que un desfase de reloj no la deje invalida', async () => {
    const before = Date.now();
    const url = new URL(await storage().signedReadUrl('items/a.png', 900));

    const startsOn = Date.parse(url.searchParams.get('st') ?? '');
    const expiresOn = Date.parse(url.searchParams.get('se') ?? '');

    expect(startsOn).toBeLessThanOrEqual(before - CLOCK_SKEW_MS + 1_000);
    // La vida util se cuenta desde ahora, no desde el inicio adelantado.
    expect(expiresOn).toBeGreaterThanOrEqual(before + 900_000 - 1_000);
    expect(url.searchParams.get('sp')).toBe('r');
  });
});

describe('AzureBlobMediaStorage con identidad administrada', () => {
  const delegationKey = (startsOn: Date, expiresOn: Date) => ({
    signedObjectId: '00000000-0000-0000-0000-000000000001',
    signedTenantId: '00000000-0000-0000-0000-000000000002',
    signedStartsOn: startsOn,
    signedExpiresOn: expiresOn,
    signedService: 'b',
    signedVersion: '2025-01-05',
    value: Buffer.alloc(32, 7).toString('base64'),
  });

  const managedStorage = () => {
    const storage = new AzureBlobMediaStorage({
      mediaAzureAccountUrl: 'https://cuenta.blob.core.windows.net',
      mediaAzureAccountName: 'cuenta',
      mediaAzureContainer: 'catalog-media',
    } as CatalogConfig);
    const getUserDelegationKey = vi.fn((startsOn: Date, expiresOn: Date) =>
      Promise.resolve(delegationKey(startsOn, expiresOn)),
    );
    (
      storage as unknown as {
        service: { getUserDelegationKey: typeof getUserDelegationKey };
      }
    ).service = {
      getUserDelegationKey,
    };
    return { storage, getUserDelegationKey };
  };

  it('pide la user delegation key una vez y la reutiliza para las siguientes firmas', async () => {
    const { storage, getUserDelegationKey } = managedStorage();

    await Promise.all([
      storage.signedReadUrl('items/a.png', 900),
      storage.signedReadUrl('items/b.png', 900),
    ]);
    await storage.signedReadUrl('items/c.png', 900);

    expect(getUserDelegationKey).toHaveBeenCalledOnce();
    const [startsOn, expiresOn] = getUserDelegationKey.mock.calls[0];
    expect(expiresOn.getTime() - startsOn.getTime()).toBeGreaterThanOrEqual(
      DELEGATION_KEY_TTL_MS,
    );
  });

  it('si Azure falla, la siguiente firma vuelve a pedir la llave', async () => {
    const { storage, getUserDelegationKey } = managedStorage();
    getUserDelegationKey.mockRejectedValueOnce(new Error('Azure no responde'));

    await expect(storage.signedReadUrl('items/a.png', 900)).rejects.toThrow(
      'Azure no responde',
    );
    await expect(storage.signedReadUrl('items/a.png', 900)).resolves.toContain(
      'sig=',
    );

    expect(getUserDelegationKey).toHaveBeenCalledTimes(2);
  });
});

describe('AzureBlobMediaStorage.remove', () => {
  it('borra el blob con deleteIfExists de su cliente (el contenedor no tiene deleteBlobIfExists)', async () => {
    const storage = new AzureBlobMediaStorage({
      mediaAzureConnectionString: AZURITE,
      mediaAzureAccountName: 'devstoreaccount1',
      mediaAzureContainer: 'catalog-media',
    } as CatalogConfig);
    const deleteIfExists = vi.fn().mockResolvedValue({ succeeded: true });
    const getBlockBlobClient = vi.fn(() => ({ deleteIfExists }));
    (
      storage as unknown as {
        container: { getBlockBlobClient: typeof getBlockBlobClient };
      }
    ).container = {
      getBlockBlobClient,
    };

    await storage.remove('items/a.png');

    expect(getBlockBlobClient).toHaveBeenCalledWith('items/a.png');
    expect(deleteIfExists).toHaveBeenCalledOnce();
  });
});
