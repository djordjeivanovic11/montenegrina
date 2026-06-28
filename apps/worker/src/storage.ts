import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Environment } from '@montenegrina/config';

export class ObjectStorage {
  readonly #client: S3Client;

  constructor(private readonly environment: Environment) {
    this.#client = new S3Client({
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

  async get(key: string): Promise<Uint8Array> {
    const response = await this.#client.send(
      new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key }),
    );
    if (!response.Body) throw new Error(`Object is empty: ${key}`);
    return response.Body.transformToByteArray();
  }

  async put(key: string, value: string, contentType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.environment.S3_BUCKET,
        Key: key,
        Body: value,
        ContentType: contentType,
        ...(this.environment.NODE_ENV === 'production' ? { ServerSideEncryption: 'aws:kms' } : {}),
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key }),
    );
  }
}
