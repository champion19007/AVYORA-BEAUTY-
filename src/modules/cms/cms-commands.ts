import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { cmsDocuments, cmsRevisions } from '@/db/schema';
import { CommandError, defineCommand, type CommandActor } from '@/infrastructure/commands/command';
import type { Tx } from '@/infrastructure/idempotency/idempotency';
import { currentRequestId } from '@/infrastructure/request-context';
import { recordAudit } from '@/modules/audit/audit';
import { emitEvent } from '@/lib/events';
import { isContentType, parseBody, slugSchema, type ContentType } from './content-types';

/**
 * Editing content: save a draft, publish it, take it down, restore an old one.
 *
 * Each is a command, so each runs validate → authorise → one transaction
 * holding the change, its revision, its audit row and (for publish) the event
 * that invalidates caches. Owner-only, like prices.
 *
 * Concurrency is optimistic, as with prices: the editor carries the version it
 * loaded, and every command that changes a document checks it. Publishing in
 * particular checks it, because publishing means "put what I am looking at
 * live" — if someone saved a newer draft in between, that is not what the
 * person pressing the button reviewed.
 *
 * Publish and unpublish are idempotent without a key: publishing a version
 * that is already live, or unpublishing something already down, changes
 * nothing and emits nothing.
 */

export const STALE_CONTENT_MESSAGE =
  'Someone else saved this while you were editing. Reload to see their version, then try again.';

const ownerOnly = (actor: CommandActor) => actor.role === 'owner';

const contentTypeSchema = z.string().refine(isContentType, 'Unknown content type.');

async function lockDocument(tx: Tx, documentId: string) {
  const [doc] = await tx
    .select()
    .from(cmsDocuments)
    .where(eq(cmsDocuments.id, documentId))
    .for('update')
    .limit(1);
  if (!doc) throw new CommandError('not_found', 'That document no longer exists.');
  return doc;
}

async function recordRevision(
  tx: Tx,
  documentId: string,
  version: number,
  body: unknown,
  action: 'save' | 'publish' | 'unpublish' | 'restore',
  actor: CommandActor
) {
  await tx.insert(cmsRevisions).values({
    documentId,
    version,
    body,
    action,
    actor: actor.id,
    requestId: await currentRequestId(),
  });
}

/* -------------------------------------------------------------------------- */
/* Save draft                                                                   */
/* -------------------------------------------------------------------------- */

export const saveDraft = defineCommand({
  name: 'content.save',
  schema: z.object({
    type: contentTypeSchema,
    slug: slugSchema,
    body: z.unknown(),
    /** 0 when the editor opened a document that did not exist yet. */
    expectedVersion: z.number().int().min(0),
  }),
  authorize: ownerOnly,

  async run(input, actor, tx) {
    const type = input.type as ContentType;
    const parsed = parseBody(type, input.body);
    if (!parsed.success) {
      throw new CommandError('conflict', parsed.error.issues[0]?.message ?? 'Check the fields and try again.');
    }
    const body = parsed.data;

    const where = and(eq(cmsDocuments.type, type), eq(cmsDocuments.slug, input.slug));
    const [current] = await tx.select().from(cmsDocuments).where(where).for('update').limit(1);

    if ((current?.version ?? 0) !== input.expectedVersion) {
      throw new CommandError('conflict', STALE_CONTENT_MESSAGE);
    }

    let id: string;
    let version: number;

    if (!current) {
      // Two first saves racing: the unique (type, slug) index lets one in.
      const [created] = await tx
        .insert(cmsDocuments)
        .values({ type, slug: input.slug, draft: body, version: 1, updatedBy: actor.id })
        .onConflictDoNothing()
        .returning({ id: cmsDocuments.id, version: cmsDocuments.version });
      if (!created) throw new CommandError('conflict', STALE_CONTENT_MESSAGE);
      ({ id, version } = created);
    } else {
      const [updated] = await tx
        .update(cmsDocuments)
        .set({ draft: body, version: current.version + 1, updatedAt: new Date(), updatedBy: actor.id })
        .where(and(eq(cmsDocuments.id, current.id), eq(cmsDocuments.version, current.version)))
        .returning({ id: cmsDocuments.id, version: cmsDocuments.version });
      if (!updated) throw new CommandError('conflict', STALE_CONTENT_MESSAGE);
      ({ id, version } = updated);
    }

    await recordRevision(tx, id, version, body, 'save', actor);
    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'content.save',
        entityType: 'cms_document',
        entityId: id,
        before: current ? { version: current.version } : null,
        after: { type, slug: input.slug, version },
      },
      tx
    );

    return { id, version };
  },
});

/* -------------------------------------------------------------------------- */
/* Publish                                                                      */
/* -------------------------------------------------------------------------- */

export const publishDocument = defineCommand({
  name: 'content.publish',
  schema: z.object({
    documentId: z.string().min(1),
    expectedVersion: z.number().int().min(1),
  }),
  authorize: ownerOnly,

  async run(input, actor, tx) {
    const doc = await lockDocument(tx, input.documentId);

    if (doc.version !== input.expectedVersion) {
      throw new CommandError('conflict', STALE_CONTENT_MESSAGE);
    }

    // Already live at this version: a double-click or a retried request.
    if (doc.status === 'published' && doc.publishedVersion === doc.version) {
      return { id: doc.id, version: doc.version, changed: false };
    }

    /*
     * Re-validated, not trusted. The draft was valid when saved, but the
     * schema may have tightened since, and what goes live must satisfy the
     * schema the storefront renders against today.
     */
    if (!isContentType(doc.type)) throw new CommandError('conflict', 'Unknown content type.');
    const parsed = parseBody(doc.type, doc.draft);
    if (!parsed.success) {
      throw new CommandError(
        'conflict',
        `This draft no longer passes checks (${parsed.error.issues[0]?.message ?? 'invalid'}). Save it again first.`
      );
    }

    const now = new Date();
    await tx
      .update(cmsDocuments)
      .set({
        status: 'published',
        published: parsed.data,
        publishedVersion: doc.version,
        publishedAt: now,
        updatedAt: now,
        updatedBy: actor.id,
      })
      .where(eq(cmsDocuments.id, doc.id));

    await recordRevision(tx, doc.id, doc.version, parsed.data, 'publish', actor);
    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'content.publish',
        entityType: 'cms_document',
        entityId: doc.id,
        before: { publishedVersion: doc.publishedVersion, status: doc.status },
        after: { publishedVersion: doc.version, status: 'published' },
      },
      tx
    );
    await emitEvent(
      'content.published',
      doc.id,
      { documentId: doc.id, type: doc.type, slug: doc.slug, version: doc.version },
      tx,
      await currentRequestId()
    );

    return { id: doc.id, version: doc.version, changed: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Unpublish                                                                    */
/* -------------------------------------------------------------------------- */

export const unpublishDocument = defineCommand({
  name: 'content.unpublish',
  schema: z.object({ documentId: z.string().min(1) }),
  authorize: ownerOnly,

  async run(input, actor, tx) {
    const doc = await lockDocument(tx, input.documentId);
    if (doc.status !== 'published') return { id: doc.id, changed: false };

    await tx
      .update(cmsDocuments)
      .set({
        status: 'draft',
        published: null,
        publishedVersion: null,
        updatedAt: new Date(),
        updatedBy: actor.id,
      })
      .where(eq(cmsDocuments.id, doc.id));

    await recordRevision(tx, doc.id, doc.version, doc.published ?? doc.draft, 'unpublish', actor);
    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'content.unpublish',
        entityType: 'cms_document',
        entityId: doc.id,
        before: { publishedVersion: doc.publishedVersion, status: doc.status },
        after: { publishedVersion: null, status: 'draft' },
      },
      tx
    );
    await emitEvent(
      'content.unpublished',
      doc.id,
      { documentId: doc.id, type: doc.type, slug: doc.slug },
      tx,
      await currentRequestId()
    );

    return { id: doc.id, changed: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Restore a revision                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Copies an old revision's body into a new draft.
 *
 * Never publishes: restoring means "take me back to that text", and whether it
 * goes live is a separate, deliberate step. History is appended to, not
 * rewritten — the restore is itself a new revision.
 */
export const restoreRevision = defineCommand({
  name: 'content.restore',
  schema: z.object({
    documentId: z.string().min(1),
    revisionId: z.number().int().positive(),
    expectedVersion: z.number().int().min(1),
  }),
  authorize: ownerOnly,

  async run(input, actor, tx) {
    const doc = await lockDocument(tx, input.documentId);
    if (doc.version !== input.expectedVersion) {
      throw new CommandError('conflict', STALE_CONTENT_MESSAGE);
    }

    const [revision] = await tx
      .select()
      .from(cmsRevisions)
      .where(and(eq(cmsRevisions.id, input.revisionId), eq(cmsRevisions.documentId, doc.id)))
      .limit(1);
    if (!revision) {
      throw new CommandError('not_found', 'That revision does not belong to this document.');
    }

    if (!isContentType(doc.type)) throw new CommandError('conflict', 'Unknown content type.');
    const parsed = parseBody(doc.type, revision.body);
    if (!parsed.success) {
      throw new CommandError(
        'conflict',
        'That revision no longer fits the current fields and cannot be restored as it is.'
      );
    }

    const version = doc.version + 1;
    await tx
      .update(cmsDocuments)
      .set({ draft: parsed.data, version, updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(cmsDocuments.id, doc.id));

    await recordRevision(tx, doc.id, version, parsed.data, 'restore', actor);
    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'content.restore',
        entityType: 'cms_document',
        entityId: doc.id,
        before: { version: doc.version },
        after: { version, restoredFrom: revision.version },
      },
      tx
    );

    return { id: doc.id, version };
  },
});
