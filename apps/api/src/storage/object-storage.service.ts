import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { ENVIRONMENT } from '../core/tokens.js';

@Injectable()
export class ObjectStorageService {
  readonly #client: S3Client;

  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
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

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.environment.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: this.environment.NODE_ENV === 'production' ? 'aws:kms' : undefined,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key }));
  }
}
