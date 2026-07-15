import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  credential: vi.fn(),
  uploadData: vi.fn(),
  deleteBlob: vi.fn(),
  getProperties: vi.fn(),
  getUserDelegationKey: vi.fn(),
  sasOptions: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: class DefaultAzureCredential {
    constructor() {
      mocks.credential();
    }
  },
}));

vi.mock('@azure/storage-blob', () => ({
  BlobSASPermissions: { parse: vi.fn((value: string) => value) },
  SASProtocol: { Https: 'https' },
  generateBlobSASQueryParameters: vi.fn((options: Record<string, unknown>) => {
    mocks.sasOptions = options;
    return { toString: () => 'sv=test&sp=r&sig=redacted' };
  }),
  BlobServiceClient: class BlobServiceClient {
    getContainerClient() {
      return {
        getBlockBlobClient: () => ({ uploadData: mocks.uploadData }),
        getBlobClient: (key: string) => ({
          url: `https://store.blob.core.windows.net/private/${key}`,
        }),
        deleteBlob: mocks.deleteBlob,
        getProperties: mocks.getProperties,
      };
    }

    getUserDelegationKey(startsOn: Date, expiresOn: Date) {
      return mocks.getUserDelegationKey(startsOn, expiresOn);
    }
  },
}));

import { ObjectStorageClient } from '../src/index.js';

describe('Azure object storage backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sasOptions = undefined;
    mocks.uploadData.mockResolvedValue(undefined);
    mocks.getProperties.mockResolvedValue({});
    mocks.getUserDelegationKey.mockResolvedValue({ signedOid: 'managed-identity' });
  });

  it('uses managed identity and uploads objects without storage account keys', async () => {
    const storage = new ObjectStorageClient({
      STORAGE_BACKEND: 'azure',
      AZURE_STORAGE_ACCOUNT_URL: 'https://store.blob.core.windows.net',
      AZURE_STORAGE_CONTAINER: 'private',
    } as never);

    await storage.put('org/document.txt', 'zdravo', 'text/plain');

    expect(mocks.credential).toHaveBeenCalledOnce();
    expect(mocks.uploadData).toHaveBeenCalledWith(expect.any(Uint8Array), {
      blobHTTPHeaders: { blobContentType: 'text/plain' },
    });
  });

  it('issues a short-lived HTTPS read-only user-delegation URL', async () => {
    const storage = new ObjectStorageClient({
      STORAGE_BACKEND: 'azure',
      AZURE_STORAGE_ACCOUNT_URL: 'https://store.blob.core.windows.net',
      AZURE_STORAGE_CONTAINER: 'private',
    } as never);

    const url = await storage.signedGetUrl('org/document.txt', 300);

    expect(url).toBe(
      'https://store.blob.core.windows.net/private/org/document.txt?sv=test&sp=r&sig=redacted',
    );
    expect(mocks.getUserDelegationKey).toHaveBeenCalledOnce();
    expect(mocks.sasOptions).toMatchObject({
      containerName: 'private',
      blobName: 'org/document.txt',
      permissions: 'r',
      protocol: 'https',
    });
    const options = mocks.sasOptions as { startsOn: Date; expiresOn: Date };
    expect(options.expiresOn.getTime() - options.startsOn.getTime()).toBeLessThanOrEqual(361_000);
  });
});
