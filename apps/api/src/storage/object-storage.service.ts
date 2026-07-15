import { Inject, Injectable } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';
import { ObjectStorageClient } from '@montenegrina/object-storage';

import { ENVIRONMENT } from '../core/tokens.js';

@Injectable()
export class ObjectStorageService {
  readonly #client: ObjectStorageClient;

  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
    this.#client = new ObjectStorageClient(environment);
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.#client.put(key, body, contentType);
  }

  async delete(key: string): Promise<void> {
    await this.#client.delete(key);
  }

  async get(key: string): Promise<{ body: Uint8Array; contentType: string }> {
    return this.#client.get(key);
  }

  async presignedGetUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return this.#client.signedGetUrl(key, expiresInSeconds);
  }

  async ping(): Promise<'ok' | 'failed'> {
    return this.#client.ping();
  }
}
