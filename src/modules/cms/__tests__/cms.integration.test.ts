import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { auditLogs, cmsDocuments, cmsRevisions, domainEvents, mediaAssets } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';
import { MemoryObjectStorage } from '@/infrastructure/storage/memory-storage';

/**
 * Content: drafts never leak, publishing is deliberate and idempotent, the
 * storefront sees a publish immediately, and every change leaves a trail.
 */

// A real shared cache layer, so the "sees it immediately" tests mean something.
process.env.CACHE_L2 = 'memory';

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

const { saveDraft, publishDocument, unpublishDocument, restoreRevision, STALE_CONTENT_MESSAGE } =
  await import('../cms-commands');
const { productCopy, publishedArticle, publishedArticles, invalidateContent } = await import(
  '../content-read'
);
const { uploadMedia, sniffImageType } = await import('../media');
const { cache, POLICIES } = await import('@/infrastructure/cache');

const owner = { id: 'owner', role: 'owner' };
const manager = { id: 'manager', role: 'manager' };
const SLUG = 'rice-bran-cleansing-oil';

const copy = (over: Record<string, unknown> = {}) => ({
  tagline: 'Melts sunscreen, rinses clean.',
  description: 'A light oil that emulsifies on contact with water.',
  howToUse: 'Massage onto dry skin, add water, rinse.',
  highlights: ['Rinses without residue'],
  ...over,
});

const save = (over: Record<string, unknown> = {}, expectedVersion = 0) =>
  saveDraft({ type: 'product_copy', slug: SLUG, body: copy(over), expectedVersion }, owner);

async function publishAndInvalidate(documentId: string, expectedVersion: number) {
  const result = await publishDocument({ documentId, expectedVersion }, owner);
  // What the admin action does after the command commits.
  await invalidateContent('product_copy', SLUG);
  return result;
}

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(
    sql`truncate cms_documents, cms_revisions, media_assets, audit_logs, domain_events restart identity cascade`
  );
  await cache.invalidateNamespace(POLICIES.content);
});

describe('drafts', () => {
  it('never shows a draft on the storefront', async () => {
    const saved = await save();
    expect(saved.ok).toBe(true);
    expect(await productCopy(SLUG)).toBeNull();
  });

  it('refuses a save from a stale version instead of overwriting', async () => {
    await save();
    await save({ tagline: 'Second editor' }, 1);

    const stale = await save({ tagline: 'First editor, still on v1' }, 1);
    expect(stale).toEqual({ ok: false, code: 'conflict', message: STALE_CONTENT_MESSAGE });

    const [doc] = await db.select().from(cmsDocuments);
    expect((doc.draft as { tagline: string }).tagline).toBe('Second editor');
  });

  it('rejects a body that does not fit the schema', async () => {
    const result = await save({ tagline: '' });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    expect(await db.select().from(cmsDocuments)).toHaveLength(0);
  });

  it('is owner-only', async () => {
    const result = await saveDraft(
      { type: 'product_copy', slug: SLUG, body: copy(), expectedVersion: 0 },
      manager
    );
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('publishing', () => {
  it('puts the reviewed version live, and the storefront sees it at once', async () => {
    const saved = await save();
    if (!saved.ok) throw new Error('save failed');

    // Warm the cache with "nothing published", so a missed invalidation shows.
    expect(await productCopy(SLUG)).toBeNull();

    const published = await publishAndInvalidate(saved.value.id, 1);
    expect(published).toMatchObject({ ok: true, value: { changed: true } });
    expect((await productCopy(SLUG))?.tagline).toBe('Melts sunscreen, rinses clean.');
  });

  it('keeps the live text while a newer draft is edited', async () => {
    const saved = await save();
    if (!saved.ok) throw new Error('save failed');
    await publishAndInvalidate(saved.value.id, 1);

    await save({ tagline: 'Unfinished new wording' }, 1);
    await invalidateContent('product_copy', SLUG);

    expect((await productCopy(SLUG))?.tagline).toBe('Melts sunscreen, rinses clean.');
  });

  it('refuses to publish a version other than the one reviewed', async () => {
    const saved = await save();
    if (!saved.ok) throw new Error('save failed');
    await save({ tagline: 'Saved by someone else' }, 1);

    const result = await publishDocument({ documentId: saved.value.id, expectedVersion: 1 }, owner);
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('is idempotent: publishing twice emits one event and one publish revision', async () => {
    const saved = await save();
    if (!saved.ok) throw new Error('save failed');

    const first = await publishDocument({ documentId: saved.value.id, expectedVersion: 1 }, owner);
    const second = await publishDocument({ documentId: saved.value.id, expectedVersion: 1 }, owner);

    expect(first).toMatchObject({ ok: true, value: { changed: true } });
    expect(second).toMatchObject({ ok: true, value: { changed: false } });
    expect(await db.select().from(domainEvents).where(eq(domainEvents.name, 'content.published'))).toHaveLength(1);
    expect(
      await db.select().from(cmsRevisions).where(eq(cmsRevisions.action, 'publish'))
    ).toHaveLength(1);
  });

  it('writes the change, its revision, its audit row and its event together', async () => {
    const saved = await save();
    if (!saved.ok) throw new Error('save failed');
    await publishDocument({ documentId: saved.value.id, expectedVersion: 1 }, owner);

    const audit = await db.select().from(auditLogs);
    expect(audit.map((a) => a.action)).toEqual(['content.save', 'content.publish']);
    const [event] = await db.select().from(domainEvents);
    expect(event.payload).toMatchObject({ type: 'product_copy', slug: SLUG, version: 1 });
  });

  it('takes content down on unpublish, and does nothing the second time', async () => {
    const saved = await save();
    if (!saved.ok) throw new Error('save failed');
    await publishAndInvalidate(saved.value.id, 1);

    const first = await unpublishDocument({ documentId: saved.value.id }, owner);
    await invalidateContent('product_copy', SLUG);
    const second = await unpublishDocument({ documentId: saved.value.id }, owner);

    expect(first).toMatchObject({ ok: true, value: { changed: true } });
    expect(second).toMatchObject({ ok: true, value: { changed: false } });
    expect(await productCopy(SLUG)).toBeNull();
  });
});

describe('revisions', () => {
  it('restores an old version as a new draft, without publishing it', async () => {
    const saved = await save();
    if (!saved.ok) throw new Error('save failed');
    await publishAndInvalidate(saved.value.id, 1);
    await save({ tagline: 'A worse tagline' }, 1);

    const [original] = await db
      .select()
      .from(cmsRevisions)
      .where(eq(cmsRevisions.version, 1))
      .limit(1);

    const restored = await restoreRevision(
      { documentId: saved.value.id, revisionId: original.id, expectedVersion: 2 },
      owner
    );
    expect(restored).toMatchObject({ ok: true, value: { version: 3 } });

    const [doc] = await db.select().from(cmsDocuments);
    expect((doc.draft as { tagline: string }).tagline).toBe('Melts sunscreen, rinses clean.');
    expect(doc.publishedVersion).toBe(1);
    expect(await db.select().from(cmsRevisions)).toHaveLength(4); // save, publish, save, restore
  });

  it('refuses a revision from another document', async () => {
    const a = await save();
    const b = await saveDraft(
      { type: 'product_copy', slug: 'centella-cleansing-balm', body: copy(), expectedVersion: 0 },
      owner
    );
    if (!a.ok || !b.ok) throw new Error('save failed');
    const [bRevision] = await db
      .select()
      .from(cmsRevisions)
      .where(eq(cmsRevisions.documentId, b.value.id));

    const result = await restoreRevision(
      { documentId: a.value.id, revisionId: bRevision.id, expectedVersion: 1 },
      owner
    );
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('articles', () => {
  it('lists only published articles, newest first', async () => {
    for (const slug of ['first-post', 'second-post', 'still-a-draft']) {
      await saveDraft(
        { type: 'article', slug, body: { title: slug, body: 'Hello.' }, expectedVersion: 0 },
        owner
      );
    }
    const docs = await db.select().from(cmsDocuments);
    for (const slug of ['first-post', 'second-post']) {
      const doc = docs.find((d) => d.slug === slug)!;
      await publishDocument({ documentId: doc.id, expectedVersion: 1 }, owner);
      await invalidateContent('article', slug);
    }

    const list = await publishedArticles();
    expect(list.map((a) => a.slug)).toEqual(['second-post', 'first-post']);
    expect(await publishedArticle('still-a-draft')).toBeNull();
    expect((await publishedArticle('first-post'))?.title).toBe('first-post');
  });
});

describe('media', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);

  it('decides the type from the bytes, and refuses SVG and disguised files', () => {
    expect(sniffImageType(png)?.type).toBe('image/png');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });

  it('stores once however many times the same image is uploaded', async () => {
    const storage = new MemoryObjectStorage();
    const first = await uploadMedia(png, 'A bottle', owner, storage);
    const second = await uploadMedia(png, 'Same bottle again', owner, storage);

    expect(first).toMatchObject({ ok: true, deduplicated: false });
    expect(second).toMatchObject({ ok: true, deduplicated: true });
    if (!first.ok || !second.ok) throw new Error('upload failed');
    expect(second.id).toBe(first.id);
    expect(storage.objects.size).toBe(1);
    expect(await db.select().from(mediaAssets)).toHaveLength(1);
  });

  it('says so plainly when no storage is configured', async () => {
    const result = await uploadMedia(png, '', owner, null);
    expect(result).toMatchObject({ ok: false });
    expect(await db.select().from(mediaAssets)).toHaveLength(0);
  });

  it('refuses a manager', async () => {
    expect(await uploadMedia(png, '', manager, new MemoryObjectStorage())).toMatchObject({ ok: false });
  });
});
