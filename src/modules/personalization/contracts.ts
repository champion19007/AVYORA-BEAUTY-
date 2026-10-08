import { z } from 'zod';

/**
 * Validated inputs for a saved routine (spec section 12, `SkinProfileV2`).
 *
 * The save request carries inputs and the knowledge release the browser
 * used; the server computes the result. Unknown keys are rejected
 * everywhere, so a client cannot smuggle in a result, a price or a safety
 * decision. Pure: shared by browser and server.
 */

export const CONCERN_IDS = [
  'blemish_appearance',
  'uneven_tone',
  'dryness_reported',
  'shine_appearance',
  'fine_line_appearance',
] as const;
export type ConcernId = (typeof CONCERN_IDS)[number];

/**
 * Catalogue concern tags each concern id ranks, in order. Product
 * categorisation for ranking, not a clinical mapping; the public concern
 * labels still need a clinician-reviewed nomenclature (spec section 12).
 */
export const CONCERN_CATALOGUE_TAGS: Readonly<Record<ConcernId, readonly string[]>> = {
  blemish_appearance: ['acne', 'pores', 'pore-care'],
  uneven_tone: ['dark-spots', 'uneven', 'dullness', 'brightening'],
  dryness_reported: ['dryness', 'dehydration', 'barrier-repair'],
  shine_appearance: ['oil-control', 'oiliness'],
  fine_line_appearance: ['aging', 'lines', 'expression-lines'],
};

/** Spec caps: profile JSON 16 KB, 20 owned items, 50 ingredients each, 30 allergy ids. */
export const PROFILE_MAX_BYTES = 16 * 1024;
export const RESULT_MAX_BYTES = 32 * 1024;

const tri = z.enum(['yes', 'no', 'unknown']);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const ownedItemSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    label: z.string().trim().min(1).max(80),
    ingredientIds: z.array(id).max(50),
    coverage: z.enum(['known', 'partial', 'unknown']),
    prescribed: z.boolean(),
    role: z.enum(['cleanse', 'moisturise', 'protect', 'other']).optional(),
  })
  .strict();

export const skinProfileV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    ageBand: z.enum(['under18', 'adult', 'unknown']),
    skinType: z.enum(['oily', 'dry', 'combination', 'normal', 'unknown']),
    reactivity: z.enum(['low', 'medium', 'high', 'very_high', 'unknown']),
    pregnancy: tri,
    nursing: tri,
    currentlyIrritated: tri,
    allergyHistory: tri,
    prescribedTreatment: tri,
    priorities: z
      .array(z.enum(CONCERN_IDS))
      .max(3)
      .refine((p) => new Set(p).size === p.length, 'priorities must be unique'),
    budgetPaise: z.number().int().min(0).max(1_000_000),
    maxDailySteps: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    experience: z.enum(['new', 'some', 'experienced']),
    adherence: z.enum(['low', 'medium', 'high']),
    allergyIngredientIds: z.array(id).max(30),
    preferences: z.object({ eyeCare: z.boolean(), bodyCare: z.boolean() }).strict(),
    ownedItems: z
      .array(ownedItemSchema)
      .max(20)
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'owned item ids must be unique'),
  })
  .strict();
export type SkinProfileV2 = z.infer<typeof skinProfileV2Schema>;

export const routineRequestSchema = z
  .object({
    profile: skinProfileV2Schema,
    /** The release the browser computed its provisional routine with. */
    kbRelease: z.string().regex(/^kb_[0-9a-f]{32}$/),
    /** A hosted scan this owner owns; its observations are read server-side. */
    scanId: z.string().uuid().optional(),
    /** Products the customer swapped out; the server applies the same exclusions. */
    excludeProductIds: z
      .array(id)
      .max(30)
      .refine((p) => new Set(p).size === p.length, 'excluded products must be unique')
      .optional(),
  })
  .strict();
export type RoutineRequest = z.infer<typeof routineRequestSchema>;

export const feedbackRequestSchema = z
  .object({
    week: z.number().int().min(1).max(52),
    adherence: z.enum(['every_day', 'most_days', 'some_days', 'not_at_all']),
    tolerability: z.enum(['comfortable', 'mild_discomfort', 'irritated', 'stopped']),
    reportedChange: z.enum(['better', 'same', 'worse', 'unsure']),
    /** The saved routine's knowledge release, so feedback is never attributed to a recomputed routine. */
    kbRelease: z.string().regex(/^kb_[0-9a-f]{32}$/),
  })
  .strict();

/** A hosted scan's stored result (`scan_sessions.result`), spec `ObservationV1`. */
export const scanResultSchema = z.object({
  observations: z
    .array(
      z
        .object({
          schemaVersion: z.literal(1),
          concern: z.enum(CONCERN_IDS),
          state: z.enum(['low', 'medium', 'high', 'unknown']),
          source: z.literal('vision'),
          evidenceGroup: z.string().min(1).max(64),
          quality: z.enum(['accepted', 'uncertain', 'rejected']),
          modelVersion: z.string().max(64).optional(),
        })
        .strict()
    )
    .max(50),
});

/** Catalogue tags in priority order, for ranking. */
export function priorityTags(concerns: readonly string[]): string[] {
  return [...new Set(concerns.flatMap((c) => CONCERN_CATALOGUE_TAGS[c as ConcernId] ?? []))];
}
