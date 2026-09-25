'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isDatabaseConfigured } from '@/db';
import { getStaffSession } from '@/lib/staff-auth';
import { revalidateContent } from '@/lib/storefront-cache';
import {
  publishDocument,
  restoreRevision,
  saveDraft,
  unpublishDocument,
} from '@/modules/cms/cms-commands';
import { isContentType, type ContentType } from '@/modules/cms/content-types';
import { uploadMedia } from '@/modules/cms/media';

/**
 * The content editor's server actions.
 *
 * Thin by design: turn the form into command input, run the command, then
 * refresh caches and pages *after* it has committed. The command does the
 * checking, the transaction and the audit; nothing here decides anything.
 */

export type ContentFormState = { error?: string; saved?: boolean; conflict?: boolean };

async function ownerActor() {
  const session = await getStaffSession();
  return session?.role === 'owner' ? { id: session.username, role: session.role } : null;
}

const field = (form: FormData, name: string) => String(form.get(name) ?? '');

/** Reads the fields for a content type out of the editor form. */
function bodyFrom(type: ContentType, form: FormData): unknown {
  if (type === 'product_copy') {
    return {
      tagline: field(form, 'tagline'),
      description: field(form, 'description'),
      howToUse: field(form, 'howToUse'),
      highlights: field(form, 'highlights')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    };
  }
  return {
    title: field(form, 'title'),
    excerpt: field(form, 'excerpt'),
    body: field(form, 'body'),
    heroAssetId: field(form, 'heroAssetId').trim(),
  };
}

const editorPath = (type: string, slug: string) => `/admin/content/${type}/${slug}`;

export async function saveContent(
  _prev: ContentFormState,
  form: FormData
): Promise<ContentFormState> {
  if (!isDatabaseConfigured()) return { error: 'No database configured.' };
  const actor = await ownerActor();
  if (!actor) return { error: 'Only the owner can edit content.' };

  const type = field(form, 'type');
  if (!isContentType(type)) return { error: 'Unknown content type.' };
  const slug = field(form, 'slug').trim();
  const isNew = field(form, 'isNew') === '1';

  const result = await saveDraft(
    {
      type,
      slug,
      body: bodyFrom(type, form),
      expectedVersion: Number(field(form, 'version')) || 0,
    },
    actor
  );
  if (!result.ok) return { error: result.message, conflict: result.code === 'conflict' };

  revalidatePath('/admin/content');
  // A new article was typed at /new; send the editor to its real address.
  if (isNew) redirect(editorPath(type, slug));
  revalidatePath(editorPath(type, slug));
  return { saved: true };
}

async function afterPublishChange(form: FormData) {
  const type = field(form, 'type');
  const slug = field(form, 'slug');
  // Immediately, rather than waiting for the event consumer to drain.
  await revalidateContent(type, slug);
  revalidatePath('/admin/content');
  revalidatePath(editorPath(type, slug));
  return editorPath(type, slug);
}

export async function publishContent(form: FormData): Promise<void> {
  const actor = await ownerActor();
  if (!actor) return;
  const result = await publishDocument(
    { documentId: field(form, 'documentId'), expectedVersion: Number(field(form, 'version')) },
    actor
  );
  const path = await afterPublishChange(form);
  if (!result.ok) redirect(`${path}?error=${encodeURIComponent(result.message)}`);
}

export async function unpublishContent(form: FormData): Promise<void> {
  const actor = await ownerActor();
  if (!actor) return;
  await unpublishDocument({ documentId: field(form, 'documentId') }, actor);
  await afterPublishChange(form);
}

export async function restoreContent(form: FormData): Promise<void> {
  const actor = await ownerActor();
  if (!actor) return;
  const result = await restoreRevision(
    {
      documentId: field(form, 'documentId'),
      revisionId: Number(field(form, 'revisionId')),
      expectedVersion: Number(field(form, 'version')),
    },
    actor
  );
  const path = editorPath(field(form, 'type'), field(form, 'slug'));
  revalidatePath(path);
  if (!result.ok) redirect(`${path}?error=${encodeURIComponent(result.message)}`);
}

export type UploadFormState = { error?: string; uploaded?: { id: string; url: string } };

export async function uploadContentMedia(
  _prev: UploadFormState,
  form: FormData
): Promise<UploadFormState> {
  if (!isDatabaseConfigured()) return { error: 'No database configured.' };
  const actor = await ownerActor();
  if (!actor) return { error: 'Only the owner can upload media.' };

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image to upload.' };

  const result = await uploadMedia(new Uint8Array(await file.arrayBuffer()), field(form, 'alt'), actor);
  if (!result.ok) return { error: result.message };

  revalidatePath('/admin/content/media');
  return { uploaded: { id: result.id, url: result.url } };
}
