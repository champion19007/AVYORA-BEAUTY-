/**
 * Where bytes live: uploaded images today, analytics exports later.
 *
 * Postgres holds the index (which asset, what type, who uploaded it); the
 * bytes go here. Keeping them out of the database keeps backups small and
 * lets a CDN serve images without touching the application.
 *
 * Keys are chosen by the caller and are expected to be content-addressed
 * where that makes sense, which makes `put` idempotent: writing the same key
 * with the same bytes twice is harmless, so an upload can simply be retried.
 */
export interface ObjectStorage {
  /** A short name for logs and the admin UI, e.g. `s3` or `local-disk`. */
  readonly kind: string;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Lists keys under a prefix. Used by exports, not the storefront. */
  list(prefix: string): Promise<string[]>;
  /** The URL a browser should use to fetch this object. */
  publicUrl(key: string): string;
}

/** Rejects keys that could escape a directory or confuse a URL. */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.length > 512 ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some((part) => part === '' || part === '.' || part === '..') ||
    !/^[A-Za-z0-9._\-=/]+$/.test(key)
  ) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}
