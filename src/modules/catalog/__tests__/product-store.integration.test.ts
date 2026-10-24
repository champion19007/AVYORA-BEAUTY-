import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';
import {
  LAUNCH_DRAFTS,
  liveCatalogue,
  listEditableProducts,
  productInputSchema,
  saveProduct,
  setUpLaunchCatalogue,
  PLACEHOLDER_IMAGE,
  PLACEHOLDER_DESCRIPTION,
  previewCatalogue,
} from '../product-store';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
const db = () => ctx.db as never;

beforeAll(async () => {
  ctx = await createMigratedDb();
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});

const form = (over: Record<string, unknown> = {}) =>
  productInputSchema.parse({
    name: 'Mineral Sunscreen SPF 50',
    status: 'draft',
    category: 'sun',
    tagline: '',
    description: 'A zinc oxide sunscreen.',
    howToUse: 'Last step of the morning.',
    keyIngredients: 'Zinc oxide\nNiacinamide',
    fullIngredients: 'Aqua, Zinc Oxide',
    skinTypes: ['oily'],
    concerns: 'protect',
    images: '',
    routineSlot: 'sunscreen',
    isBestSeller: false,
    isNew: true,
    sortOrder: 1,
    sizes: [{ label: '50ml', pricePaise: 59900, costPaise: 18000 }],
    ...over,
  });

describe('product store', () => {
  it('starts from the seeded sample identities, with sample text as defaults', async () => {
    const all = await listEditableProducts(db());
    const wash = all.find((p) => p.id === 'face-wash')!;
    expect(wash.status).toBe('live');
    expect(wash.description).toContain('pH 5.5');
    expect(wash.sizes[0]).toMatchObject({ label: '150ml', costPaise: null });
  });

  it('launch set-up hides every existing product and adds the five drafts, once', async () => {
    const first = await setUpLaunchCatalogue(db(), 'owner');
    expect(first.created).toBe(LAUNCH_DRAFTS.length);
    expect(first.hidden).toBeGreaterThan(20);
    expect(await setUpLaunchCatalogue(db(), 'owner')).toEqual({ hidden: 0, created: 0 });
    expect(await liveCatalogue(db())).toEqual([]);
    // Nothing is live yet, but a preview shows exactly the six, at their placeholder prices.
    const preview = await previewCatalogue(db());
    expect(preview.map((p) => p.name)).toEqual([
      'Face Wash',
      'Cleanser',
      'Moisturiser',
      'Mineral Sunscreen',
      'Vitamin C Serum',
      'Retinol Serum',
    ]);
    expect(preview[0]).toMatchObject({
      description: PLACEHOLDER_DESCRIPTION,
      images: [PLACEHOLDER_IMAGE],
      sizes: [{ label: '150ml', price: 349 }],
      routineSlot: 'gelCleanser',
    });
  });

  it('creates a product with its size, price, cost and an empty stock row', async () => {
    const saved = await saveProduct(db(), form(), 'owner');
    expect(saved).toEqual({ ok: true, id: 'mineral-sunscreen-spf-50' });
    const [stock] = (
      await ctx.client.query<{ quantity: number }>(
        `SELECT quantity FROM inventory WHERE product_id = 'mineral-sunscreen-spf-50'`
      )
    ).rows;
    expect(stock.quantity).toBe(0);
    expect(await saveProduct(db(), form(), 'owner')).toMatchObject({ ok: false });
  });

  it('will not put a product live without cost prices, or below the profit floor', async () => {
    const id = 'mineral-sunscreen-spf-50';
    const noCost = await saveProduct(
      db(),
      form({ id, status: 'live', sizes: [{ label: '50ml', pricePaise: 59900, costPaise: null }] }),
      'owner'
    );
    expect(noCost.ok).toBe(false);
    const tooCheap = await saveProduct(
      db(),
      form({ id, status: 'live', sizes: [{ label: '50ml', pricePaise: 20000, costPaise: 18000 }] }),
      'owner'
    );
    expect(tooCheap).toMatchObject({ ok: false, errors: [expect.stringContaining('below its profit floor')] });
    expect(await saveProduct(db(), form({ id, status: 'live' }), 'owner')).toEqual({ ok: true, id });
  });

  it('publishes only live products, with the placeholder image and routine slot', async () => {
    const live = await liveCatalogue(db());
    expect(live.map((p) => p.id)).toEqual(['mineral-sunscreen-spf-50']);
    // The preview adds the six drafts around it.
    expect((await previewCatalogue(db())).length).toBe(7);
    expect(live[0]).toMatchObject({ images: [PLACEHOLDER_IMAGE], routineSlot: 'sunscreen', price: 599 });
  });

  it('retires a size removed from the form instead of deleting it', async () => {
    const id = 'mineral-sunscreen-spf-50';
    await saveProduct(db(), form({ id, sizes: [{ label: '30ml', pricePaise: 39900, costPaise: 11000 }] }), 'owner');
    const p = (await listEditableProducts(db())).find((x) => x.id === id)!;
    expect(p.sizes.map((s) => s.label)).toEqual(['30ml']);
    const rows = (await ctx.client.query(`SELECT id FROM catalog_variants WHERE product_id = '${id}'`)).rows;
    expect(rows).toHaveLength(2);
  });
});
