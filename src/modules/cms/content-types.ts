import { z } from 'zod';

/**
 * The kinds of content the owner can edit, and the fields each one has.
 *
 * The schema lives in code, not in the database. A document's body is jsonb,
 * and this is what gives it a shape: every save and every publish is checked
 * against it, so the storefront can render a published body without
 * defending against missing or wrongly typed fields.
 *
 * Plain text only. Nothing here is rendered as HTML, so an editor cannot
 * paste a script into a product description and have it run on the
 * storefront. Article bodies use two conventions and nothing more: a blank
 * line starts a paragraph, and a line beginning `## ` is a subheading.
 */

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);

export const productCopySchema = z.object({
  tagline: text(160).min(1, 'A tagline is required.'),
  description: text(2_000).min(1, 'A description is required.'),
  howToUse: text(1_500).default(''),
  /** Short points shown as a list. Blank lines are dropped. */
  highlights: z.array(text(120)).max(6, 'Six highlights at most.').default([]),
});

export const articleSchema = z.object({
  title: text(140).min(1, 'A title is required.'),
  excerpt: text(300).default(''),
  body: text(20_000).min(1, 'The article needs a body.'),
  /** A media asset id, or empty for no hero image. */
  heroAssetId: z.string().max(64).default(''),
});

export const CONTENT_TYPES = {
  product_copy: productCopySchema,
  article: articleSchema,
} as const;

export type ContentType = keyof typeof CONTENT_TYPES;
export type ProductCopy = z.infer<typeof productCopySchema>;
export type Article = z.infer<typeof articleSchema>;
export type ContentBody<T extends ContentType> = z.infer<(typeof CONTENT_TYPES)[T]>;

export function isContentType(value: string): value is ContentType {
  return Object.hasOwn(CONTENT_TYPES, value);
}

/** Lower-case words joined by hyphens: what a URL segment should look like. */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'A slug is required.')
  .max(80, 'Keep the slug under 80 characters.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and single hyphens.');

/** Validates a body against its type's schema. */
export function parseBody(type: ContentType, body: unknown) {
  return CONTENT_TYPES[type].safeParse(body);
}

/** An article body split into the blocks the storefront renders. */
export type ArticleBlock = { kind: 'heading' | 'paragraph'; text: string };

export function articleBlocks(body: string): ArticleBlock[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) =>
      chunk.startsWith('## ')
        ? { kind: 'heading' as const, text: chunk.slice(3).trim() }
        : { kind: 'paragraph' as const, text: chunk.replace(/\s*\r?\n\s*/g, ' ') }
    );
}
