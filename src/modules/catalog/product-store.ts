import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import * as schema from '@/db/schema';
import { SAMPLE_PRODUCTS, type Product } from '@/data/mock-data';
import { toPaise } from '@/lib/money';
import { skuKey } from '@/modules/catalog/sku-price';
import { variantId, volumeMl } from '@/modules/catalog/catalog-records';
import { DEFAULT_PROFIT_SETTINGS, minProfitablePrice, type ProfitSettings } from '@/modules/offers/profit';

/**
 * Products as the owner edits them in /admin/products.
 *
 * The database is the source: `catalog_products` (copy, status, routine
 * slot), `catalog_variants` (sizes and cost prices), `product_pricing`
 * (selling prices, which checkout already reads live) and `inventory`.
 * A column left null falls back to the sample catalogue's value for that
 * id, so the samples keep their text until edited and nothing is copied.
 *
 * The shop does not query this per request. "Publish to shop" rebuilds the
 * site, and the build writes the live products into
 * `src/data/catalogue.published.json` (scripts/export-catalogue.ts), where
 * every page reads them as it read the samples. Prices and stock stay live.
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const P = schema.catalogProducts;
const V = schema.catalogVariants;

export const PRODUCT_STATUSES = ['draft', 'live', 'hidden'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_CATEGORIES = [
  ['cleanser', 'Cleanser / face wash'],
  ['toner', 'Toner'],
  ['essence', 'Essence'],
  ['serum', 'Serum'],
  ['moisturizer', 'Moisturiser'],
  ['sun', 'Sunscreen'],
  ['exfoliator', 'Exfoliator'],
  ['mask', 'Mask'],
  ['lip', 'Lip care'],
  ['body', 'Body care'],
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number][0];

export const SKIN_TYPES = ['oily', 'dry', 'combination', 'normal', 'sensitive'] as const;

/** Where the "coming soon" image lives: shown for any product without photos. */
export const PLACEHOLDER_IMAGE = '/images/products/coming-soon.jpg';

export type EditableSize = { label: string; pricePaise: number; costPaise: number | null; stock: number | null };

export type EditableProduct = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  category: string;
  tagline: string;
  description: string;
  howToUse: string;
  keyIngredients: string[];
  fullIngredients: string;
  skinTypes: string[];
  concerns: string[];
  images: string[];
  routineSlot: string | null;
  isBestSeller: boolean;
  isNew: boolean;
  sortOrder: number;
  sizes: EditableSize[];
  updatedAt: Date;
  updatedBy: string | null;
};

const SAMPLES = new Map(SAMPLE_PRODUCTS.map((p) => [p.id, p]));

/** Every product, any status, merged with sample defaults. Sorted for the admin list. */
export async function listEditableProducts(db: Db): Promise<EditableProduct[]> {
  const [products, variants, prices, stock] = await Promise.all([
    db.select().from(P).orderBy(asc(P.sortOrder), asc(P.name)),
    db.select().from(V).where(eq(V.active, true)).orderBy(asc(V.sortOrder), asc(V.sizeLabel)),
    db.select().from(schema.productPricing),
    db.select().from(schema.inventory),
  ]);
  const priceByKey = new Map(prices.map((r) => [skuKey(r.productId, r.size), r.price]));
  const stockByKey = new Map(stock.map((r) => [skuKey(r.productId, r.size), r.quantity]));

  return products.map((row) => {
    const sample = SAMPLES.get(row.id);
    const sizes = variants
      .filter((v) => v.productId === row.id)
      .map((v) => {
        const samplePrice = sample?.sizes.find((s) => s.label === v.sizeLabel)?.price;
        return {
          label: v.sizeLabel,
          pricePaise: priceByKey.get(v.legacyStockKey) ?? (samplePrice !== undefined ? toPaise(samplePrice) : 0),
          costPaise: v.costPaise,
          stock: stockByKey.get(v.legacyStockKey) ?? null,
        };
      });
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: (PRODUCT_STATUSES as readonly string[]).includes(row.status) ? (row.status as ProductStatus) : 'hidden',
      category: row.category,
      tagline: row.tagline ?? sample?.tagline ?? '',
      description: row.description ?? sample?.description ?? '',
      howToUse: row.howToUse ?? '',
      keyIngredients: row.keyIngredients ?? sample?.ingredients ?? [],
      fullIngredients: row.fullIngredients ?? '',
      skinTypes: row.skinTypes ?? [],
      concerns: row.concerns ?? sample?.concerns ?? [],
      images: row.images ?? sample?.images.filter(Boolean) ?? [],
      routineSlot: row.routineSlot,
      isBestSeller: row.isBestSeller ?? sample?.isBestSeller ?? false,
      isNew: row.isNew ?? sample?.isNewLaunch ?? false,
      sortOrder: row.sortOrder,
      sizes,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  });
}

export async function getEditableProduct(db: Db, id: string): Promise<EditableProduct | null> {
  return (await listEditableProducts(db)).find((p) => p.id === id) ?? null;
}

/** The storefront's shape. Prices are rupees there (the catalogue's convention); checkout re-reads paise. */
export function toStorefrontProduct(p: EditableProduct): Product {
  const sizes = p.sizes.map((s) => ({ label: s.label, price: s.pricePaise / 100 }));
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    tagline: p.tagline,
    description: p.description,
    images: p.images.length ? p.images : [PLACEHOLDER_IMAGE],
    price: sizes[0]?.price ?? 0,
    isBestSeller: p.isBestSeller,
    isNewLaunch: p.isNew,
    category: p.category as Product['category'],
    concerns: p.concerns,
    ingredients: p.keyIngredients,
    sizes,
    ...(p.howToUse ? { howToUse: p.howToUse } : {}),
    ...(p.fullIngredients ? { fullIngredients: p.fullIngredients } : {}),
    ...(p.skinTypes.length ? { skinTypes: p.skinTypes } : {}),
    ...(p.routineSlot ? { routineSlot: p.routineSlot } : {}),
  };
}

/** The products the shop should show: live, with at least one size. */
export async function liveCatalogue(db: Db): Promise<Product[]> {
  return (await listEditableProducts(db))
    .filter((p) => p.status === 'live' && p.sizes.length > 0)
    .map(toStorefrontProduct);
}

/* -------------------------------------------------------------------------- */
/* Saving                                                                      */
/* -------------------------------------------------------------------------- */

const lines = (s: string) =>
  s
    .split(/\r?\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);

export const productInputSchema = z.object({
  /** Absent for a new product. */
  id: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  name: z.string().trim().min(2, 'Give the product a name.').max(120),
  status: z.enum(PRODUCT_STATUSES),
  category: z.string().refine((c) => PRODUCT_CATEGORIES.some(([id]) => id === c), 'Choose a category.'),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(4000),
  howToUse: z.string().trim().max(2000),
  keyIngredients: z.string().max(2000).transform(lines),
  fullIngredients: z.string().trim().max(6000),
  skinTypes: z.array(z.enum(SKIN_TYPES)),
  concerns: z.string().max(1000).transform(lines),
  images: z
    .string()
    .max(4000)
    .transform(lines)
    .pipe(z.array(z.string().regex(/^(\/|https:\/\/)\S+$/, 'Each image must be an uploaded image link.')).max(8)),
  routineSlot: z.string().max(40).nullable(),
  isBestSeller: z.boolean(),
  isNew: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  sizes: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Every size needs a label, e.g. 50ml.').max(40),
        pricePaise: z.number().int().min(100, 'Every size needs a price.').max(10_000_000),
        costPaise: z.number().int().min(0).max(10_000_000).nullable(),
      })
    )
    .max(6),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * What stops a product going live. A draft or hidden product may be
 * incomplete; a live one must be sellable, and at a profit.
 */
export function liveProblems(input: ProductInput, settings: ProfitSettings): string[] {
  if (input.status !== 'live') return [];
  const problems: string[] = [];
  if (input.sizes.length === 0) problems.push('Add at least one size with a price before putting it live.');
  if (!input.description) problems.push('Write a description before putting it live.');
  for (const s of input.sizes) {
    if (s.costPaise === null) {
      problems.push(`Add the cost price for ${s.label}: it is how the shop makes sure every sale is profitable.`);
    } else if (s.pricePaise < minProfitablePrice(s.costPaise, settings)) {
      problems.push(
        `${s.label} at ₹${s.pricePaise / 100} is below its profit floor of ₹${Math.ceil(
          minProfitablePrice(s.costPaise, settings) / 100
        )} (cost + ${settings.floorPercent}% after GST and fees).`
      );
    }
  }
  const labels = input.sizes.map((s) => s.label.toLowerCase().replace(/\s+/g, ''));
  if (new Set(labels).size !== labels.length) problems.push('Two sizes have the same label.');
  return problems;
}

export type SaveResult = { ok: true; id: string } | { ok: false; errors: string[] };

export async function saveProduct(
  db: Db,
  input: ProductInput,
  actor: string,
  settings: ProfitSettings = DEFAULT_PROFIT_SETTINGS
): Promise<SaveResult> {
  const problems = liveProblems(input, settings);
  if (problems.length) return { ok: false, errors: problems };

  const id = input.id ?? slugify(input.name);
  if (!id) return { ok: false, errors: ['Use letters or numbers in the name.'] };

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: P.id }).from(P).where(eq(P.id, id)).limit(1);
    if (!input.id && existing) {
      return {
        ok: false as const,
        errors: [`A product called "${input.name}" already exists. Edit that one instead.`],
      };
    }
    const values = {
      name: input.name,
      status: input.status,
      category: input.category,
      tagline: input.tagline,
      description: input.description,
      howToUse: input.howToUse,
      keyIngredients: input.keyIngredients,
      fullIngredients: input.fullIngredients,
      skinTypes: input.skinTypes,
      concerns: input.concerns,
      images: input.images,
      routineSlot: input.routineSlot || null,
      isBestSeller: input.isBestSeller,
      isNew: input.isNew,
      sortOrder: input.sortOrder,
      published: input.status === 'live',
      updatedBy: actor,
      updatedAt: new Date(),
    };
    if (existing) await tx.update(P).set(values).where(eq(P.id, id));
    else await tx.insert(P).values({ id, slug: id, ...values });

    // Sizes: upsert those in the form, retire the rest (never deleted: orders point at them).
    const keep: string[] = [];
    for (const [i, size] of input.sizes.entries()) {
      const vid = variantId(id, size.label);
      keep.push(vid);
      await tx
        .insert(V)
        .values({
          id: vid,
          productId: id,
          legacyStockKey: skuKey(id, size.label),
          sizeLabel: size.label,
          volumeMl: volumeMl(size.label)?.toString() ?? null,
          costPaise: size.costPaise,
          sortOrder: i,
          active: true,
        })
        .onConflictDoUpdate({ target: V.id, set: { costPaise: size.costPaise, sortOrder: i, active: true } });
      await tx
        .insert(schema.productPricing)
        .values({ productId: id, size: size.label, price: size.pricePaise, updatedBy: actor })
        .onConflictDoUpdate({
          target: [schema.productPricing.productId, schema.productPricing.size],
          set: {
            price: size.pricePaise,
            updatedBy: actor,
            updatedAt: new Date(),
            version: sql`${schema.productPricing.version} + 1`,
          },
        });
      // A new size starts with no stock; the Stock page sets it.
      await tx.insert(schema.inventory).values({ productId: id, size: size.label, quantity: 0 }).onConflictDoNothing();
    }
    await tx
      .update(V)
      .set({ active: false })
      .where(keep.length ? and(eq(V.productId, id), notInArray(V.id, keep)) : eq(V.productId, id));

    await tx.insert(schema.auditLogs).values({
      actor,
      actorRole: 'owner',
      action: existing ? 'product.update' : 'product.create',
      entityType: 'product',
      entityId: id,
      newValue: { ...values, sizes: input.sizes } as unknown,
    });
    return { ok: true as const, id };
  });
}

/* -------------------------------------------------------------------------- */
/* Launch set-up and publishing                                                */
/* -------------------------------------------------------------------------- */

/**
 * The launch range: the six products the shop opens with. Created as drafts
 * with a placeholder line and a placeholder size and price (borrowed from the
 * closest sample) so they can be shown as a preview before the real details
 * are entered. Every placeholder is overwritten in the product editor.
 */
export const LAUNCH_DRAFTS: {
  id: string;
  name: string;
  category: ProductCategory;
  routineSlot: string;
  size: string;
  pricePaise: number;
}[] = [
  {
    id: 'avyora-face-wash',
    name: 'Face Wash',
    category: 'cleanser',
    routineSlot: 'gelCleanser',
    size: '150ml',
    pricePaise: 34900,
  },
  {
    id: 'avyora-cleanser',
    name: 'Cleanser',
    category: 'cleanser',
    routineSlot: 'cleansingBalm',
    size: '100ml',
    pricePaise: 79900,
  },
  {
    id: 'avyora-moisturiser',
    name: 'Moisturiser',
    category: 'moisturizer',
    routineSlot: 'moisturizerLight',
    size: '50ml',
    pricePaise: 54900,
  },
  {
    id: 'avyora-mineral-sunscreen',
    name: 'Mineral Sunscreen',
    category: 'sun',
    routineSlot: 'sunscreen',
    size: '50ml',
    pricePaise: 64900,
  },
  {
    id: 'avyora-vitamin-c-serum',
    name: 'Vitamin C Serum',
    category: 'serum',
    routineSlot: 'vitaminC',
    size: '30ml',
    pricePaise: 49900,
  },
  {
    id: 'avyora-retinol',
    name: 'Retinol Serum',
    category: 'serum',
    routineSlot: 'retinol',
    size: '30ml',
    pricePaise: 39900,
  },
];

/** Shown until the owner writes the real description. */
export const PLACEHOLDER_DESCRIPTION = 'Full details, ingredients and photos are coming soon.';

/**
 * One-time set-up: every other product becomes hidden (kept, editable,
 * switchable back on), and the launch range is created as drafts with a
 * placeholder size and price and no stock. Safe to run twice: drafts that
 * exist are left alone, and so are their sizes and prices.
 */
export async function setUpLaunchCatalogue(db: Db, actor: string): Promise<{ hidden: number; created: number }> {
  return db.transaction(async (tx) => {
    const launchIds = LAUNCH_DRAFTS.map((d) => d.id);
    const hidden = await tx
      .update(P)
      .set({ status: 'hidden', published: false, updatedBy: actor, updatedAt: new Date() })
      .where(and(notInArray(P.id, launchIds), inArray(P.status, ['live', 'draft'])))
      .returning({ id: P.id });
    const created = await tx
      .insert(P)
      .values(
        LAUNCH_DRAFTS.map((d, i) => ({
          id: d.id,
          slug: d.id,
          name: d.name,
          category: d.category,
          routineSlot: d.routineSlot,
          description: PLACEHOLDER_DESCRIPTION,
          status: 'draft',
          published: false,
          isNew: true,
          sortOrder: i + 1,
          updatedBy: actor,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: P.id });
    const fresh = new Set(created.map((c) => c.id));
    for (const d of LAUNCH_DRAFTS.filter((x) => fresh.has(x.id))) {
      await tx.insert(V).values({
        id: variantId(d.id, d.size),
        productId: d.id,
        legacyStockKey: skuKey(d.id, d.size),
        sizeLabel: d.size,
        volumeMl: volumeMl(d.size)?.toString() ?? null,
        active: true,
      });
      await tx
        .insert(schema.productPricing)
        .values({ productId: d.id, size: d.size, price: d.pricePaise, updatedBy: actor })
        .onConflictDoNothing();
      await tx.insert(schema.inventory).values({ productId: d.id, size: d.size, quantity: 0 }).onConflictDoNothing();
    }
    await tx.insert(schema.auditLogs).values({
      actor,
      actorRole: 'owner',
      action: 'catalogue.launch_setup',
      entityType: 'catalogue',
      entityId: 'launch',
      newValue: { hidden: hidden.length, created: created.map((c) => c.id) } as unknown,
    });
    return { hidden: hidden.length, created: created.length };
  });
}

/**
 * What a preview shows: everything not hidden (drafts included) that has a
 * size. The site labels it all as samples and refuses orders, so drafts can
 * be seen on the shop before their details are final.
 */
export async function previewCatalogue(db: Db): Promise<Product[]> {
  return (await listEditableProducts(db))
    .filter((p) => p.status !== 'hidden' && p.sizes.length > 0)
    .map(toStorefrontProduct);
}

/** `shop_settings` key recording that the owner has published, and when. */
export const PUBLISH_KEY = 'catalogue_publish';
/** `preview`: drafts shown too, labelled as samples, ordering off (see previewCatalogue). */
export type PublishRecord = {
  requestedAt: string;
  by: string;
  preview?: boolean;
  /**
   * The exact products published. Every build writes these, so a deploy for
   * a code change re-publishes what the owner published, not whatever is
   * saved in the editor at that moment. Older records without it fall back
   * to reading the catalogue.
   */
  products?: Product[];
};

export async function publishRecord(db: Db): Promise<PublishRecord | null> {
  const [row] = await db
    .select({ value: schema.shopSettings.value })
    .from(schema.shopSettings)
    .where(eq(schema.shopSettings.key, PUBLISH_KEY))
    .limit(1);
  return (row?.value as PublishRecord | undefined) ?? null;
}

export async function recordPublish(db: Db, by: string, products: Product[], preview = false): Promise<PublishRecord> {
  const value: PublishRecord = {
    requestedAt: new Date().toISOString(),
    by,
    products,
    ...(preview ? { preview: true } : {}),
  };
  await db
    .insert(schema.shopSettings)
    .values({ key: PUBLISH_KEY, value, updatedBy: by })
    .onConflictDoUpdate({ target: schema.shopSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  return value;
}
