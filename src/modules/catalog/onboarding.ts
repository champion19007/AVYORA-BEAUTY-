/**
 * Product onboarding: validation and preview of a real product's record
 * before it can be published or recommended.
 *
 * A record bundles what a verified product needs: identifiers, SKU
 * variants with integer-paise prices, licensed images, verified attributes,
 * a formulation version (ordered INCI with canonical ingredient ids),
 * optional approved directions, claims linked to evidence, and a review.
 *
 * The validator never publishes or writes anything. It reports, per record:
 *   - `publishable`: may be added to the verified catalogue;
 *   - `recommendable`: may also enter routines (its formulation identity is
 *     complete; a treatment additionally needs approved directions);
 *   - every blocking problem, and every unresolved field, by name.
 * Unresolved safety information keeps a product out of recommendations; it
 * never becomes an assumption of safety. Draft records are never publishable.
 *
 * Reuses the shared checks (formulations.ts, content-claims.ts) so onboarding
 * and the release compiler can never disagree.
 */
import { z } from 'zod';
import { findContentProblems } from '@/lib/content-claims';
import {
  formulationProblems,
  unresolvedIngredients,
  type EvidenceSource,
  type Formulation,
} from '@/modules/ingredients/formulations';
import type { ProductDirections } from '@/data/product-directions';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const productRecordSchema = z
  .object({
    id: slug,
    slug,
    name: z.string().trim().min(2).max(120),
    category: z.enum([
      'cleanser',
      'toner',
      'essence',
      'serum',
      'moisturizer',
      'sun',
      'mask',
      'exfoliator',
      'skin',
      'hair',
      'body',
      'lip',
    ]),
    role: z.enum(['cleanse', 'moisturise', 'protect', 'treatment', 'optional', 'none']),
    description: z.string().trim().min(20).max(2000),
    variants: z
      .array(
        z
          .object({
            sku: z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/),
            sizeLabel: z.string().trim().min(2).max(30),
            pricePaise: z.number().int().positive().max(10_000_000),
            mrpPaise: z.number().int().positive().max(10_000_000).optional(),
          })
          .strict()
      )
      .min(1)
      .max(10),
    images: z
      .array(
        z
          .object({
            url: z.string().url().startsWith('https://'),
            alt: z.string().trim().min(3).max(200),
            width: z.number().int().min(800),
            height: z.number().int().min(800),
            licence: z.enum(['owned', 'licensed']),
            credit: z.string().trim().min(2).max(120),
          })
          .strict()
      )
      .max(12),
    attributes: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z_]{2,40}$/),
            value: z.string().trim().min(1).max(120),
            sourceId: z.string().min(1),
          })
          .strict()
      )
      .max(30),
    formulation: z.custom<Formulation>((v) => typeof v === 'object' && v !== null),
    directions: z.custom<ProductDirections>((v) => typeof v === 'object' && v !== null).optional(),
    claims: z
      .array(
        z
          .object({
            text: z.string().trim().min(3).max(300),
            evidenceIds: z.array(z.string()).min(1),
            limitations: z.string().trim().min(3).max(500),
          })
          .strict()
      )
      .max(20),
    review: z.union([
      z.object({ status: z.literal('draft'), note: z.string().optional() }).strict(),
      z
        .object({
          status: z.literal('approved'),
          reviewerId: z.string().min(2),
          reviewedAt: isoDate,
          sourceIds: z.array(z.string()).min(1),
        })
        .strict(),
    ]),
  })
  .strict();

export type ProductRecord = z.infer<typeof productRecordSchema>;

export type RecordReport = {
  id: string;
  publishable: boolean;
  recommendable: boolean;
  problems: string[];
  /** Fields still missing or unresolved; they do not all block publishing, but they limit what the product can be used for. */
  unresolved: string[];
};

export type OnboardingPreview = { ok: boolean; records: RecordReport[]; problems: string[] };

/** Validates a batch of product records against each other and the evidence on file. Writes nothing. */
export function previewOnboarding(
  input: unknown,
  evidence: readonly EvidenceSource[],
  existingIds: readonly string[] = []
): OnboardingPreview {
  const list = z.array(z.unknown()).max(200).safeParse(input);
  if (!list.success)
    return { ok: false, records: [], problems: ['Expected a JSON array of at most 200 product records.'] };
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const seenIds = new Set<string>();
  const seenSkus = new Set<string>();
  const records: RecordReport[] = [];
  const batch: string[] = [];

  list.data.forEach((raw, i) => {
    const parsed = productRecordSchema.safeParse(raw);
    if (!parsed.success) {
      records.push({
        id: (raw as { id?: string } | null)?.id ?? `#${i + 1}`,
        publishable: false,
        recommendable: false,
        problems: parsed.error.issues.map((x) => `${x.path.join('.') || 'record'}: ${x.message}`),
        unresolved: [],
      });
      return;
    }
    const r = parsed.data;
    const problems: string[] = [];
    const unresolved: string[] = [];

    if (seenIds.has(r.id)) batch.push(`Duplicate product id ${r.id} in this batch`);
    seenIds.add(r.id);
    if (existingIds.includes(r.id))
      problems.push(`Product id ${r.id} already exists; use a new formulation version instead`);
    for (const v of r.variants) {
      if (seenSkus.has(v.sku)) batch.push(`Duplicate SKU ${v.sku}`);
      seenSkus.add(v.sku);
      if (v.mrpPaise !== undefined && v.mrpPaise < v.pricePaise)
        problems.push(`${v.sku}: MRP is below the selling price`);
    }
    if (r.review.status !== 'approved')
      problems.push('Record is a draft: it needs an approved review before publishing');
    else
      for (const id of r.review.sourceIds)
        if (!evidenceIds.has(id)) problems.push(`Review source ${id} does not exist`);
    if (r.images.length === 0) unresolved.push('images (no licensed product photograph)');

    // Formulation: the shared publication checks, then identity coverage.
    const f = { ...r.formulation, productId: r.id };
    problems.push(...formulationProblems(f, evidence));
    if (f.coverage !== 'complete') unresolved.push(`formulation coverage is ${f.coverage}`);
    const unknownIds = f.coverage === 'complete' ? unresolvedIngredients(f) : [];
    if (unknownIds.length) unresolved.push(`ingredient identity unresolved for: ${unknownIds.join(', ')}`);

    if (r.directions) {
      if (r.directions.formulationVersion !== f.version)
        problems.push(`Directions are for formulation v${r.directions.formulationVersion}, record is v${f.version}`);
      for (const id of r.directions.evidenceIds)
        if (!evidenceIds.has(id)) problems.push(`Directions evidence ${id} does not exist`);
    } else unresolved.push('approved usage directions');

    for (const a of r.attributes)
      if (!evidenceIds.has(a.sourceId)) problems.push(`Attribute ${a.key}: source ${a.sourceId} does not exist`);
    for (const c of r.claims) {
      for (const id of c.evidenceIds)
        if (!evidenceIds.has(id)) problems.push(`Claim "${c.text}": evidence ${id} does not exist`);
      for (const p of findContentProblems(c.text)) problems.push(`Claim "${c.text}": ${p.why} ("${p.match}")`);
    }
    for (const p of findContentProblems(`${r.name}\n${r.description}`)) problems.push(`Copy: ${p.why} ("${p.match}")`);

    const publishable = problems.length === 0;
    const identityComplete = f.coverage === 'complete' && unknownIds.length === 0;
    const needsDirections = r.role === 'treatment';
    const recommendable =
      publishable && r.role !== 'none' && identityComplete && (!needsDirections || Boolean(r.directions));
    if (publishable && !recommendable && r.role !== 'none')
      unresolved.push(
        'not recommendable until the formulation identity is complete' +
          (needsDirections ? ' and directions are approved' : '')
      );
    records.push({ id: r.id, publishable, recommendable, problems, unresolved });
  });

  return { ok: batch.length === 0 && records.every((r) => r.publishable), records, problems: batch };
}
