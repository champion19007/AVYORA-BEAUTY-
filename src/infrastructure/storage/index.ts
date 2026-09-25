import type { ObjectStorage } from './object-storage';
import { LocalDiskStorage } from './local-disk-storage';
import { join } from 'node:path';
import { S3Storage } from './s3-storage';

export type { ObjectStorage } from './object-storage';

/**
 * The configured object storage, or null when there is none.
 *
 *   STORAGE_S3_ENDPOINT, STORAGE_S3_BUCKET, STORAGE_S3_REGION,
 *   STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY,
 *   STORAGE_PUBLIC_BASE_URL          → an S3-compatible bucket
 *   none of those, in development   → the local disk under public/
 *   none of those, in production    → null: uploads are switched off
 *
 * Null is a real answer, and callers show it ("uploads are not configured")
 * rather than pretending. Nothing on the storefront depends on uploads
 * existing: product images still come from the catalogue.
 */
let resolved: ObjectStorage | null | undefined;

export function objectStorage(): ObjectStorage | null {
  if (resolved !== undefined) return resolved;

  const env = process.env;
  if (
    env.STORAGE_S3_ENDPOINT &&
    env.STORAGE_S3_BUCKET &&
    env.STORAGE_S3_ACCESS_KEY_ID &&
    env.STORAGE_S3_SECRET_ACCESS_KEY &&
    env.STORAGE_PUBLIC_BASE_URL
  ) {
    resolved = new S3Storage({
      endpoint: env.STORAGE_S3_ENDPOINT,
      bucket: env.STORAGE_S3_BUCKET,
      publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
      credentials: {
        accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
        // R2 uses `auto`; AWS needs the bucket's real region.
        region: env.STORAGE_S3_REGION || 'auto',
      },
    });
  } else if (env.NODE_ENV !== 'production' && !env.VERCEL) {
    resolved = new LocalDiskStorage();
  } else {
    resolved = null;
  }
  return resolved;
}

/** For tests: install a storage, or reset to re-read the environment. */
export function setObjectStorage(storage: ObjectStorage | null | undefined): void {
  resolved = storage;
}

/**
 * Storage for the analytics landing zone: exported event data.
 *
 * Never the media bucket. Media is public by design; this is not, and it
 * would be one misconfigured bucket policy away from publishing the shop's
 * order history. So it needs its own bucket (same endpoint and credentials,
 * `STORAGE_ANALYTICS_BUCKET`), and in development it goes to `.data/lake`,
 * outside `public/`, where nothing serves it.
 */
let analyticsResolved: ObjectStorage | null | undefined;

export function analyticsStorage(): ObjectStorage | null {
  if (analyticsResolved !== undefined) return analyticsResolved;

  const env = process.env;
  if (
    env.STORAGE_S3_ENDPOINT &&
    env.STORAGE_ANALYTICS_BUCKET &&
    env.STORAGE_S3_ACCESS_KEY_ID &&
    env.STORAGE_S3_SECRET_ACCESS_KEY
  ) {
    analyticsResolved = new S3Storage({
      endpoint: env.STORAGE_S3_ENDPOINT,
      bucket: env.STORAGE_ANALYTICS_BUCKET,
      // Not served publicly; the URL is only used in logs.
      publicBaseUrl: `s3://${env.STORAGE_ANALYTICS_BUCKET}`,
      credentials: {
        accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
        region: env.STORAGE_S3_REGION || 'auto',
      },
    });
  } else if (env.NODE_ENV !== 'production' && !env.VERCEL) {
    analyticsResolved = new LocalDiskStorage(join(process.cwd(), '.data', 'lake'), 'file://.data/lake');
  } else {
    analyticsResolved = null;
  }
  return analyticsResolved;
}

export function setAnalyticsStorage(storage: ObjectStorage | null | undefined): void {
  analyticsResolved = storage;
}
