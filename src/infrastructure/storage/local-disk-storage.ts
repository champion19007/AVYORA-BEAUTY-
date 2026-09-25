import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { assertSafeKey, type ObjectStorage } from './object-storage';

/**
 * Object storage on the local disk, for development.
 *
 * Writes under `public/`, so Next's dev server serves the files at
 * `/<urlPrefix>/<key>` with no extra route.
 *
 * Refuses to run in production. A serverless filesystem is read-only or
 * discarded after the request, so an upload "saved" there would vanish — the
 * worst kind of failure, one that looks like success. Production needs real
 * object storage, or uploads stay switched off.
 */
export class LocalDiskStorage implements ObjectStorage {
  readonly kind = 'local-disk';

  constructor(
    private readonly root = join(process.cwd(), 'public', 'media-local'),
    private readonly urlPrefix = '/media-local'
  ) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      throw new Error('LocalDiskStorage is for development only; configure STORAGE_S3_* in production.');
    }
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    return join(this.root, ...key.split('/'));
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { recursive: true, withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => relative(this.root, join(e.parentPath, e.name)).split(sep).join('/'))
        .filter((k) => k.startsWith(prefix))
        .sort();
    } catch {
      return [];
    }
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `${this.urlPrefix}/${key}`;
  }
}
