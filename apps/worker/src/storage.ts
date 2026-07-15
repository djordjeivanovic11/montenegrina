import type { Environment } from '@montenegrina/config';
import { ObjectStorageClient } from '@montenegrina/object-storage';

export class ObjectStorage {
  readonly #client: ObjectStorageClient;

  constructor(private readonly environment: Environment) {
    this.#client = new ObjectStorageClient(environment);
  }

  async get(key: string): Promise<Uint8Array> {
    return (await this.#client.get(key)).body;
  }

  async put(key: string, value: string, contentType: string): Promise<void> {
    await this.#client.put(key, value, contentType);
  }

  async delete(key: string): Promise<void> {
    await this.#client.delete(key);
  }
}
