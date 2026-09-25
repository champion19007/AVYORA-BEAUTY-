import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { mediaAssets } from '@/db/schema';
import { objectStorage, type ObjectStorage } from '@/infrastructure/storage';
import { recordAudit } from '@/modules/audit/audit';
import type { CommandActor } from '@/infrastructure/commands/command';

/**
 * Uploading images for content.
 *
 * The file's type is decided by its first bytes, not by the name or the
 * browser's claim. SVG is refused outright: it is a document that can carry
 * script, and serving an uploaded one from our domain would be an XSS hole.
 *
 * Order of operations, and why:
 *   1. bytes → object storage, under a key derived from their SHA-256
 *   2. row → media_assets, `on conflict do nothing` on that key
 *
 * If step 2 fails, step 1 has left an object nothing points at. That is
 * harmless: the key is the content's hash, so a retry writes the same key
 * and then the row. The reverse order could leave a row pointing at nothing,
 * which the storefront would render as a broken image.
 */

/** Under Vercel's 4.5 MB request-body ceiling, so the limit is ours to explain. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    ext: 'png',
    test: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    type: 'image/webp',
    ext: 'webp',
    test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  },
  {
    type: 'image/avif',
    ext: 'avif',
    test: (b) => ascii(b, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(b, 8, 12)),
  },
];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function sniffImageType(bytes: Uint8Array): { type: string; ext: string } | null {
  const match = SIGNATURES.find((s) => bytes.length >= 12 && s.test(bytes));
  return match ? { type: match.type, ext: match.ext } : null;
}

export type UploadResult =
  | { ok: true; id: string; url: string; deduplicated: boolean }
  | { ok: false; message: string };

export async function uploadMedia(
  bytes: Uint8Array,
  alt: string,
  actor: CommandActor,
  storage: ObjectStorage | null = objectStorage()
): Promise<UploadResult> {
  if (actor.role !== 'owner') return { ok: false, message: 'Only the owner can upload media.' };
  if (!storage) {
    return { ok: false, message: 'Uploads are not configured on this deployment (no object storage).' };
  }
  if (bytes.length === 0) return { ok: false, message: 'That file is empty.' };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, message: 'Images must be 4 MB or smaller.' };

  const kind = sniffImageType(bytes);
  if (!kind) return { ok: false, message: 'Upload a JPEG, PNG, WebP or AVIF image.' };

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const storageKey = `media/${sha256.slice(0, 2)}/${sha256}.${kind.ext}`;

  const [existing] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.storageKey, storageKey))
    .limit(1);
  if (existing) {
    return { ok: true, id: existing.id, url: storage.publicUrl(storageKey), deduplicated: true };
  }

  await storage.put(storageKey, bytes, kind.type);

  const cleanAlt = alt.trim().slice(0, 300);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(mediaAssets)
      .values({
        storageKey,
        contentType: kind.type,
        bytes: bytes.length,
        sha256,
        alt: cleanAlt,
        uploadedBy: actor.id,
      })
      .onConflictDoNothing()
      .returning({ id: mediaAssets.id });

    // Lost a race with an identical upload: theirs is the row.
    if (!row) {
      const [winner] = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(eq(mediaAssets.storageKey, storageKey))
        .limit(1);
      return winner.id;
    }

    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'media.upload',
        entityType: 'media_asset',
        entityId: row.id,
        after: { storageKey, contentType: kind.type, bytes: bytes.length, alt: cleanAlt },
      },
      tx
    );
    return row.id;
  });

  return { ok: true, id, url: storage.publicUrl(storageKey), deduplicated: false };
}

export async function recentMedia(limit = 60) {
  const storage = objectStorage();
  const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(limit);
  return rows.map((row) => ({ ...row, url: storage?.publicUrl(row.storageKey) ?? null }));
}

/** The public URL of one asset, for rendering an article's hero image. */
export async function mediaUrl(id: string): Promise<{ url: string; alt: string } | null> {
  if (!id) return null;
  const storage = objectStorage();
  if (!storage) return null;
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return row ? { url: storage.publicUrl(row.storageKey), alt: row.alt } : null;
}
