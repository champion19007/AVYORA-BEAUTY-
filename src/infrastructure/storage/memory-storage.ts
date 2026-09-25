import { assertSafeKey, type ObjectStorage } from './object-storage';

/** Object storage in a Map. For tests only: it is gone when the process is. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly kind = 'memory';
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertSafeKey(key);
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.body ?? null;
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  publicUrl(key: string): string {
    return `memory://${key}`;
  }
}
