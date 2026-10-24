'use server';

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, isDatabaseConfigured } from '@/db';
import { getStaffSession } from '@/lib/staff-auth';
import { reportError } from '@/lib/observability';
import { uploadMedia } from '@/modules/cms/media';
import {
  liveCatalogue,
  previewCatalogue,
  productInputSchema,
  recordPublish,
  saveProduct,
  setUpLaunchCatalogue,
  type ProductInput,
} from '@/modules/catalog/product-store';
import { getProfitSettings } from '@/modules/offers/settings';

/** The owner's username, or null. Products are owner-only: they set what is sold and for how much. */
async function owner(): Promise<string | null> {
  const session = await getStaffSession();
  return session?.role === 'owner' ? session.username : null;
}

export type SaveProductState = { errors?: string[]; savedId?: string };

/** Saves from the editor. The form posts JSON in one hidden field so sizes and lists arrive whole. */
export async function saveProductAction(_prev: SaveProductState, form: FormData): Promise<SaveProductState> {
  const actor = await owner();
  if (!actor) return { errors: ['Only the owner can edit products.'] };
  if (!isDatabaseConfigured()) return { errors: ['No database is configured.'] };

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('product') ?? ''));
  } catch {
    return { errors: ['The form could not be read. Reload the page and try again.'] };
  }
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };

  const result = await saveProduct(db, parsed.data as ProductInput, actor, await getProfitSettings(db));
  if (!result.ok) return { errors: result.errors };

  revalidatePath('/admin/products');
  if (!parsed.data.id) redirect(`/admin/products/${result.id}?created=1`);
  return { savedId: result.id };
}

export type UploadImageState = { error?: string; url?: string };

export async function uploadProductImage(_prev: UploadImageState, form: FormData): Promise<UploadImageState> {
  const actor = await owner();
  if (!actor) return { error: 'Only the owner can upload images.' };
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo to upload.' };
  const result = await uploadMedia(new Uint8Array(await file.arrayBuffer()), String(form.get('alt') ?? ''), {
    id: actor,
    role: 'owner',
  });
  return result.ok ? { url: result.url } : { error: result.message };
}

export async function setUpLaunchAction(): Promise<void> {
  const actor = await owner();
  if (!actor || !isDatabaseConfigured()) return;
  await setUpLaunchCatalogue(db, actor);
  revalidatePath('/admin/products');
}

export type PublishState = { error?: string; message?: string };

/**
 * Puts the live products on the shop.
 *
 * On Vercel this starts a new deployment through the project's deploy hook
 * (VERCEL_DEPLOY_HOOK_URL); the build reads the live products from the
 * database. On a local server it writes the file directly and the page
 * reloads with it. Prices, stock and offers never need this: they are live.
 */
export async function publishCatalogueAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  const actor = await owner();
  if (!actor) return { error: 'Only the owner can publish.' };
  if (!isDatabaseConfigured()) return { error: 'No database is configured.' };
  // A preview shows drafts too, labelled as samples, with ordering switched off.
  const preview = form.get('mode') === 'preview';

  if (!process.env.VERCEL) {
    await recordPublish(db, actor, preview);
    const products = preview ? await previewCatalogue(db) : await liveCatalogue(db);
    const file = path.join(process.cwd(), 'src', 'data', 'catalogue.published.json');
    writeFileSync(
      file,
      `${JSON.stringify({ publishedAt: new Date().toISOString(), preview, products }, null, 2)}
`
    );
    revalidatePath('/', 'layout');
    return {
      message: `Published ${products.length} ${
        preview ? 'products as a preview (not for sale)' : 'live products'
      }. The local site reloads with them now.`,
    };
  }

  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hook) {
    return {
      error:
        'Publishing needs a deploy hook: in Vercel, Settings → Git → Deploy Hooks, create one for the main branch, then add its URL as VERCEL_DEPLOY_HOOK_URL and redeploy once.',
    };
  }
  await recordPublish(db, actor, preview);
  const res = await fetch(hook, { method: 'POST' }).catch((err) => {
    reportError(err, { scope: 'catalogue.publish' });
    return null;
  });
  if (!res?.ok) return { error: 'Vercel did not accept the publish request. Try again in a minute.' };
  revalidatePath('/admin/products');
  return {
    message: preview
      ? 'Publishing a preview: the shop shows these products, not for sale, in about 3 minutes.'
      : 'Publishing: the shop updates with your live products in about 3 minutes.',
  };
}
