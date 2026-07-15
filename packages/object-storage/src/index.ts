import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  generateBlobSASQueryParameters,
  type ContainerClient,
} from '@azure/storage-blob';
import type { Environment } from '@montenegrina/config';

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

export class ObjectStorageClient {
  readonly #s3?: S3Client;
  readonly #blobService?: BlobServiceClient;
  readonly #container?: ContainerClient;

  constructor(private readonly environment: Environment) {
    if (environment.STORAGE_BACKEND === 'azure') {
      this.#blobService = new BlobServiceClient(
        environment.AZURE_STORAGE_ACCOUNT_URL as string,
        new DefaultAzureCredential(),
      );
      this.#container = this.#blobService.getContainerClient(environment.AZURE_STORAGE_CONTAINER);
      return;
    }
    this.#s3 = new S3Client({
      region: environment.S3_REGION,
      ...(environment.S3_ENDPOINT
        ? { endpoint: environment.S3_ENDPOINT, forcePathStyle: true }
        : {}),
      ...(environment.S3_ACCESS_KEY_ID && environment.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: environment.S3_ACCESS_KEY_ID,
              secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async put(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
    if (this.#container) {
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      await this.#container.getBlockBlobClient(key).uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
      return;
    }
    await this.#s3?.send(
      new PutObjectCommand({
        Bucket: this.environment.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: this.environment.NODE_ENV === 'production' ? 'aws:kms' : undefined,
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    if (this.#container) {
      const response = await this.#container.getBlobClient(key).download();
      const body = await streamToBytes(response.readableStreamBody);
      return { body, contentType: response.contentType ?? 'application/octet-stream' };
    }
    const response = await this.#s3?.send(
      new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key }),
    );
    if (!response?.Body) throw new Error(`Object is empty: ${key}`);
    return {
      body: await response.Body.transformToByteArray(),
      contentType: response.ContentType ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    if (this.#container) {
      await this.#container.deleteBlob(key, { deleteSnapshots: 'include' });
      return;
    }
    await this.#s3?.send(new DeleteObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key }));
  }

  async signedGetUrl(key: string, expiresInSeconds = 900): Promise<string> {
    if (this.#container && this.#blobService) {
      const startsOn = new Date(Date.now() - 60_000);
      const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);
      const delegationKey = await this.#blobService.getUserDelegationKey(startsOn, expiresOn);
      const accountName = new URL(
        this.environment.AZURE_STORAGE_ACCOUNT_URL as string,
      ).hostname.split('.')[0] as string;
      const query = generateBlobSASQueryParameters(
        {
          containerName: this.environment.AZURE_STORAGE_CONTAINER,
          blobName: key,
          permissions: BlobSASPermissions.parse('r'),
          startsOn,
          expiresOn,
          protocol: SASProtocol.Https,
        },
        delegationKey,
        accountName,
      ).toString();
      return `${this.#container.getBlobClient(key).url}?${query}`;
    }
    return getSignedUrl(
      this.#s3 as S3Client,
      new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async ping(): Promise<'ok' | 'failed'> {
    try {
      if (this.#container) await this.#container.getProperties();
      else await this.#s3?.send(new HeadBucketCommand({ Bucket: this.environment.S3_BUCKET }));
      return 'ok';
    } catch {
      return 'failed';
    }
  }
}

async function streamToBytes(stream: NodeJS.ReadableStream | undefined): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream)
    chunks.push(
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk),
    );
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
