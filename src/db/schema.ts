import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
  uniqueIndex,
  index,
  jsonb,
  pgEnum,
  serial,
  bigserial,
  numeric,
  uuid,
  foreignKey,
  smallint,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Avyora database schema.
 *
 * Portability notes, since this is destined for AWS:
 *  - Plain Postgres only. No vendor-specific types, extensions or functions,
 *    so Neon today and RDS/Aurora later is a connection-string change.
 *  - Money is stored as integer paise (1/100 rupee), never floating point.
 *    Float arithmetic on currency produces wrong totals.
 *  - Prices are copied onto order lines at purchase time. An order must always
 *    reflect what the customer actually paid, even after the catalogue changes.
 */

/* -------------------------------------------------------------------------- */
/* Auth — table shapes required by @auth/drizzle-adapter                       */
/* -------------------------------------------------------------------------- */

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: timestamp('email_verified', { mode: 'date', withTimezone: true }),
  image: text('image'),
  phone: text('phone'),
  phoneVerified: timestamp('phone_verified', { mode: 'date', withTimezone: true }),
  /**
   * PBKDF2 hash, or null.
   *
   * Null is the normal case, not an error: someone who only ever signs in with
   * Google has no password, and must not be told they typed the wrong one —
   * they should be told to use Google. Nullable makes that state explicit
   * rather than encoding it as an empty string.
   */
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
  // Phone is a login identifier, so two accounts cannot share one. Partial:
  // most rows have no phone, and NULLs must not collide with each other.
  phoneIdx: uniqueIndex('users_phone_idx').on(t.phone).where(sql`${t.phone} is not null`),
}));

/**
 * One-time codes for email and SMS sign-in.
 *
 * Separate from `verification_tokens` (which Auth.js owns) because a
 * six-digit code needs things a magic-link token does not: an attempt counter,
 * so a code with a million possible values cannot be brute-forced, and a
 * consumed marker, so a code works exactly once even if two requests race.
 *
 * The code is stored hashed. A leaked database backup should not hand over
 * live login codes, and the same PBKDF2 helper already used for passwords
 * costs nothing extra here.
 */
export const otpCodes = pgTable('otp_codes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Email address or E.164 phone number. */
  identifier: text('identifier').notNull(),
  channel: text('channel').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  identifierIdx: index('otp_identifier_idx').on(t.identifier),
  expiresIdx: index('otp_expires_idx').on(t.expiresAt),
}));

/** Federated identities (Google, and anything added later). */
export const accounts = pgTable('accounts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (t) => ({
  pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  userIdx: index('accounts_user_idx').on(t.userId),
}));

/**
 * Database-backed sessions rather than JWTs, so "remember me" survives, and a
 * session can actually be revoked server-side.
 */
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
}, (t) => ({
  userIdx: index('sessions_user_idx').on(t.userId),
}));

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.identifier, t.token] }),
}));

/* -------------------------------------------------------------------------- */
/* Addresses                                                                    */
/* -------------------------------------------------------------------------- */

export const addresses = pgTable('addresses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  line1: text('line1').notNull(),
  line2: text('line2'),
  /** Nearby reference point. Optional, but Indian couriers rely on it heavily. */
  landmark: text('landmark'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  postalCode: text('postal_code').notNull(),
  country: text('country').notNull().default('IN'),
  phone: text('phone').notNull(),
  /**
   * The address pre-selected at checkout and shown in the header.
   *
   * At most one per user should be true. That is enforced in application code
   * (see `setDefaultAddress`) rather than by a partial unique index, because
   * promoting a new default means clearing the old one, and doing both inside
   * one transaction is simpler to reason about than an index that rejects the
   * intermediate state.
   */
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('addresses_user_idx').on(t.userId),
}));

/* -------------------------------------------------------------------------- */
/* Carts                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Server-side carts. The cart currently lives in localStorage, so it does not
 * survive a device change and the business cannot see abandoned carts. Anonymous
 * carts are keyed by a cookie id and adopted by the user on sign-in.
 */
/* -------------------------------------------------------------------------- */
/* Catalogue identities                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One row per product, and one per purchasable variant (SKU).
 *
 * Before 0014 a SKU was only the pair (product_id, size) repeated as free
 * text in every table. Each of those tables now also carries `variant_id`,
 * filled by the `resolve_catalog_variant` trigger from that same pair, so
 * every existing writer keeps working while the stable id is recorded.
 * `legacy_stock_key` (`product::size`) is the explicit compatibility map.
 *
 * Copy, prices and directions are deliberately not here yet: copy lives in
 * the CMS, list prices in the catalogue file with owner overrides in
 * `product_pricing`, and formulations arrive in a later migration. Seeded
 * from `catalogRecords(PRODUCTS)`; see `scripts/catalog-seed-sql.ts`.
 */
export const catalogProducts = pgTable('catalog_products', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  published: boolean('published').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex('catalog_products_slug_idx').on(t.slug),
  categoryIdx: index('catalog_products_category_idx').on(t.category, t.published),
}));

export const catalogVariants = pgTable('catalog_variants', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => catalogProducts.id, { onDelete: 'restrict' }),
  legacyStockKey: text('legacy_stock_key').notNull(),
  sizeLabel: text('size_label').notNull(),
  /** Only when the label states millilitres; never converted from grams or counts. */
  volumeMl: numeric('volume_ml', { precision: 8, scale: 2 }),
  /** Retire a variant by switching this off; never delete one orders point at. */
  active: boolean('active').notNull().default(true),
}, (t) => ({
  legacyIdx: uniqueIndex('catalog_variants_legacy_key_idx').on(t.legacyStockKey),
  productSizeIdx: uniqueIndex('catalog_variants_product_size_idx').on(t.productId, t.sizeLabel),
}));

export const carts = pgTable('carts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousId: text('anonymous_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('carts_user_idx').on(t.userId),
  anonIdx: index('carts_anon_idx').on(t.anonymousId),
  /*
   * One cart per person. Finding-or-creating a cart was a SELECT then an
   * INSERT with nothing to stop two requests both finding nothing; a few quick
   * taps on "Add to bag" from a new visitor created two carts, and reading one
   * back picked between them at random. Partial, because a cart belongs to a
   * user or to an anonymous visitor, and the other column is null.
   */
  userUnique: uniqueIndex('carts_user_unique').on(t.userId).where(sql`${t.userId} is not null`),
  anonUnique: uniqueIndex('carts_anon_unique').on(t.anonymousId).where(sql`${t.anonymousId} is not null`),
}));

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: text('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  size: text('size').notNull(),
  variantId: text('variant_id').references(() => catalogVariants.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull().default(1),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One row per product+size per cart; quantity carries the count.
  uniq: uniqueIndex('cart_items_unique').on(t.cartId, t.productId, t.size),
  variantIdx: index('cart_items_variant_idx').on(t.variantId),
}));

/* -------------------------------------------------------------------------- */
/* Orders                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fulfilment states, in the order they happen.
 *
 * These are internal names; what the customer is shown is mapped separately in
 * lib/order-progress.ts. `fulfilled` means packed and waiting for the courier,
 * `shipped` means the courier has it, and `out_for_delivery` is the last leg —
 * the distinction customers ask about most, and the one a single "shipped"
 * cannot answer.
 */
export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'fulfilled',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded',
  // Return to origin: the courier brought it back. Distinct from `cancelled`
  // (nobody ever tried) and `refunded` (the customer had it and sent it back).
  // This is the outcome cash-on-delivery risk scoring is trained on, so it has
  // to be recordable as its own thing.
  'returned',
]);

/**
 * Where the money is, as far as the shop knows.
 *
 * `pending` means a payment session is open with the provider and the outcome
 * is not yet known. It exists so that "we have not heard back" is represented
 * as its own state instead of being read as failure, which is the mistake that
 * let the abandonment sweep cancel orders Razorpay was still trying to confirm.
 * Transitions between these are decided in one place:
 * `modules/payments/state-machine.ts`.
 */
export const paymentStatus = pgEnum('payment_status', [
  'unpaid',
  'pending',
  'authorized',
  'paid',
  'failed',
  'refunded',
]);

export const orders = pgTable('orders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Human-facing reference, e.g. AVY-2A4F91. Shown to the customer. */
  orderNumber: text('order_number').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  email: text('email').notNull(),

  status: orderStatus('status').notNull().default('pending'),
  paymentStatus: paymentStatus('payment_status').notNull().default('unpaid'),

  /** All amounts in paise. */
  subtotal: integer('subtotal').notNull(),
  discount: integer('discount').notNull().default(0),
  shipping: integer('shipping').notNull().default(0),
  tax: integer('tax').notNull().default(0),
  total: integer('total').notNull(),
  currency: text('currency').notNull().default('INR'),

  shippingAddressId: text('shipping_address_id').references(() => addresses.id),
  /** Snapshot of the address as it was at purchase time. */
  shippingAddress: jsonb('shipping_address'),

  paymentProvider: text('payment_provider'),
  paymentReference: text('payment_reference'),

  notes: text('notes'),

  /**
   * Client-supplied key that makes placing this order safe to retry.
   *
   * Without it, a customer on a slow connection who taps "Place Order" twice
   * gets two orders and two stock reservations — and pays twice. The browser
   * generates one key per checkout attempt and sends it with every retry, so
   * the second request finds the first order instead of creating another.
   *
   * Nullable, and the unique index tolerates that: Postgres treats NULLs as
   * distinct, so orders placed before this existed do not collide with each
   * other. Enforcement lives in the index rather than in a prior read, because
   * two simultaneous requests would both pass a read.
   */
  idempotencyKey: text('idempotency_key'),
  /**
   * When this order's stock went back on the shelf, or null.
   *
   * The restore claim: exactly one caller can move this from null, and only
   * that caller releases. A retried webhook arriving while an operator clicks
   * cancel would otherwise both pass a status check and both credit the same
   * units, inventing stock out of a race.
   */
  stockRestoredAt: timestamp('stock_restored_at', { withTimezone: true }),

  /**
   * Cash-on-delivery risk gate.
   *
   * `approved` for everything prepaid — money already changed hands, there is
   * nothing to score. A COD order starts `pending` and must reach `approved`
   * before the stockroom is allowed to see it, which is what makes this a
   * checkpoint rather than an advisory flag.
   */
  fraudStatus: text('fraud_status').notNull().default('approved'),
  /** 0-100. Higher is riskier. Null until scored. */
  fraudScore: integer('fraud_score'),
  /** The signals that fired, so a human reviewing the hold can see why. */
  fraudReasons: jsonb('fraud_reasons'),

  /**
   * Set when an order needs a person, with the reason in words.
   *
   * The case that created it: a payment captured after the order's stock was
   * released, from a late webhook for a cancelled or failed order. The money is
   * real and must be honoured, but the goods may have gone to someone else. The
   * system cannot choose between refunding and fulfilling from a backorder, so
   * it records the problem and puts it in front of the owner.
   */
  attentionReason: text('attention_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  numberIdx: uniqueIndex('orders_number_idx').on(t.orderNumber),
  userIdx: index('orders_user_idx').on(t.userId),
  emailIdx: index('orders_email_idx').on(t.email),
  createdIdx: index('orders_created_idx').on(t.createdAt),
  idempotencyIdx: uniqueIndex('orders_idempotency_idx').on(t.idempotencyKey),
}));

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  /**
   * The SKU, for joins and reporting. Name, size and prices below remain the
   * record of the sale; this never replaces them. Null for a line whose
   * (product, size) matched no variant when it was written.
   */
  variantId: text('variant_id').references(() => catalogVariants.id, { onDelete: 'restrict' }),
  /** Name and size copied in, so the order still reads correctly if a SKU is renamed or retired. */
  productName: text('product_name').notNull(),
  size: text('size').notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotal: integer('line_total').notNull(),
  /**
   * How the unit price was arrived at, frozen at purchase: catalogue price,
   * owner override, any live offer with its label, and the pricing row's
   * version. Without it an order can say what was charged but not why, and
   * "why did I get 20% off" becomes unanswerable once the offer has ended.
   */
  pricingSnapshot: jsonb('pricing_snapshot'),
}, (t) => ({
  orderIdx: index('order_items_order_idx').on(t.orderId),
  variantIdx: index('order_items_variant_idx').on(t.variantId),
}));

/* -------------------------------------------------------------------------- */
/* Reviews                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Real customer reviews. Product ratings were previously hardcoded in the
 * catalogue; aggregates are derived from these rows instead.
 */
export const reviews = pgTable('reviews', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** Set when the reviewer actually bought the item, so it can be labelled. */
  orderId: text('order_id').references(() => orders.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(),
  title: text('title'),
  body: text('body'),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productIdx: index('reviews_product_idx').on(t.productId),
  // One review per customer per product.
  uniq: uniqueIndex('reviews_user_product_idx').on(t.userId, t.productId),
}));

/* -------------------------------------------------------------------------- */
/* Routine results and activity                                                 */
/* -------------------------------------------------------------------------- */

/** A saved routine-finder result, so a customer can return to it. */
/* -------------------------------------------------------------------------- */
/* Personal records: ownership and consent                                       */
/* -------------------------------------------------------------------------- */

/*
 * Every personal record has exactly one owner: an account (`user_id`) or a
 * guest (`anonymous_owner_hash`, the SHA-256 of a server-generated secret
 * held only in an HttpOnly cookie; see lib/guest-owner.ts). The raw secret
 * is never stored, and a client-supplied id is never proof of ownership.
 */
const oneOwner = (userId: unknown, hash: unknown) => sql`num_nonnulls(${userId}, ${hash}) = 1`;
const hashShape = (hash: unknown) => sql`${hash} IS NULL OR ${hash} ~ '^[0-9a-f]{64}$'`;

export const CONSENT_PURPOSES = [
  'photo_processing',
  'routine_saving',
  'progress_photo_storage',
  'model_research',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * One grant of one purpose under one policy version. Withdrawal sets
 * `withdrawn_at`; the row stays as the record that consent existed. At most
 * one active grant per owner and purpose. Records needing consent reference
 * it by (id, purpose), so a photo-processing grant can never stand in for
 * routine saving.
 */
export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousOwnerHash: text('anonymous_owner_hash'),
  purpose: text('purpose').notNull(),
  policyVersion: text('policy_version').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
}, (t) => ({
  oneOwner: check('consent_records_one_owner', oneOwner(t.userId, t.anonymousOwnerHash)),
  hashShape: check('consent_records_hash_shape', hashShape(t.anonymousOwnerHash)),
  purpose: check('consent_records_purpose', sql`${t.purpose} IN ('photo_processing', 'routine_saving', 'progress_photo_storage', 'model_research')`),
  withdrawnAfterGrant: check('consent_records_withdrawn_after_grant', sql`${t.withdrawnAt} IS NULL OR ${t.withdrawnAt} >= ${t.grantedAt}`),
  idPurpose: uniqueIndex('consent_records_id_purpose_idx').on(t.id, t.purpose),
  userPurpose: index('consent_records_user_purpose_idx').on(t.userId, t.purpose),
  guestPurpose: index('consent_records_guest_purpose_idx').on(t.anonymousOwnerHash, t.purpose),
  oneActiveUser: uniqueIndex('consent_records_one_active_user_idx')
    .on(t.userId, t.purpose)
    .where(sql`withdrawn_at IS NULL AND user_id IS NOT NULL`),
  oneActiveGuest: uniqueIndex('consent_records_one_active_guest_idx')
    .on(t.anonymousOwnerHash, t.purpose)
    .where(sql`withdrawn_at IS NULL AND anonymous_owner_hash IS NOT NULL`),
}));

/**
 * Quiz answers saved on purpose, under a routine-saving consent. Never
 * written automatically. Guest profiles expire within 30 days.
 */
export const skinProfiles = pgTable('skin_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousOwnerHash: text('anonymous_owner_hash'),
  consentId: uuid('consent_id').notNull(),
  consentPurpose: text('consent_purpose').notNull().default('routine_saving'),
  schemaVersion: integer('schema_version').notNull(),
  answers: jsonb('answers').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  oneOwner: check('skin_profiles_one_owner', oneOwner(t.userId, t.anonymousOwnerHash)),
  hashShape: check('skin_profiles_hash_shape', hashShape(t.anonymousOwnerHash)),
  purpose: check('skin_profiles_consent_purpose', sql`${t.consentPurpose} = 'routine_saving'`),
  expiry: check('skin_profiles_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
  guestExpiry: check('skin_profiles_guest_expiry', sql`${t.anonymousOwnerHash} IS NULL OR ${t.expiresAt} <= ${t.createdAt} + interval '30 days'`),
  schemaVersion: check('skin_profiles_schema_version', sql`${t.schemaVersion} >= 1`),
  consent: foreignKey({
    name: 'skin_profiles_consent_fk',
    columns: [t.consentId, t.consentPurpose],
    foreignColumns: [consentRecords.id, consentRecords.purpose],
  }).onDelete('restrict'),
  userIdx: index('skin_profiles_user_idx').on(t.userId, t.updatedAt),
  guestIdx: index('skin_profiles_guest_idx').on(t.anonymousOwnerHash, t.updatedAt),
  expiresIdx: index('skin_profiles_expires_idx').on(t.expiresAt),
}));

/**
 * Saved routine results.
 *
 * Rows from before migration 0016 keep their ids and content as
 * `schema_version = 0` (legacy): written automatically without consent and
 * keyed by the cart cookie in plaintext. Account rows stay the account's;
 * a legacy guest row has no provable owner, so it is retrievable by no one
 * (nothing ever read these rows back). Every newer row has exactly one
 * owner, a routine-saving consent, versions and an expiry.
 */
export const routineResults = pgTable('routine_results', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  /** Legacy only: the cart cookie value pre-0016 rows were keyed by. Never written now. */
  anonymousId: text('anonymous_id'),
  anonymousOwnerHash: text('anonymous_owner_hash'),
  profileId: uuid('profile_id').references(() => skinProfiles.id, { onDelete: 'set null' }),
  consentId: uuid('consent_id'),
  consentPurpose: text('consent_purpose'),
  /** 0 = legacy pre-0016 row. */
  schemaVersion: integer('schema_version').notNull(),
  inputHash: text('input_hash'),
  kbRelease: text('kb_release'),
  engineVersion: text('engine_version'),
  modelVersion: text('model_version'),
  /** Inference module version (bayes.ts) used for the concern priorities. */
  inferenceVersion: text('inference_version'),
  /** The client's idempotency key, unique per owner; a retry returns this row. */
  idempotencyKey: text('idempotency_key'),
  /** SHA-256 of the validated request; the same key with a different request is a conflict. */
  requestHash: text('request_hash'),
  answers: jsonb('answers').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('routine_results_user_idx').on(t.userId),
  userCreatedIdx: index('routine_results_user_created_idx').on(t.userId, t.createdAt),
  guestCreatedIdx: index('routine_results_guest_created_idx').on(t.anonymousOwnerHash, t.createdAt),
  expiresIdx: index('routine_results_expires_idx').on(t.expiresAt),
  dedupeIdx: index('routine_results_dedupe_idx').on(t.inputHash, t.kbRelease),
  userIdempotencyIdx: uniqueIndex('routine_results_user_idempotency_idx')
    .on(t.userId, t.idempotencyKey)
    .where(sql`user_id IS NOT NULL AND idempotency_key IS NOT NULL`),
  guestIdempotencyIdx: uniqueIndex('routine_results_guest_idempotency_idx')
    .on(t.anonymousOwnerHash, t.idempotencyKey)
    .where(sql`anonymous_owner_hash IS NOT NULL AND idempotency_key IS NOT NULL`),
  idempotencyPair: check(
    'routine_results_idempotency_pair',
    sql`(${t.idempotencyKey} IS NULL) = (${t.requestHash} IS NULL)`
  ),
  hashShape: check('routine_results_hash_shape', hashShape(t.anonymousOwnerHash)),
  versioned: check(
    'routine_results_versioned_owner',
    sql`${t.schemaVersion} = 0 OR (
      num_nonnulls(${t.userId}, ${t.anonymousOwnerHash}) = 1
      AND ${t.anonymousId} IS NULL
      AND ${t.consentId} IS NOT NULL AND ${t.consentPurpose} = 'routine_saving'
      AND ${t.inputHash} IS NOT NULL AND ${t.engineVersion} IS NOT NULL
      AND ${t.expiresAt} IS NOT NULL AND ${t.expiresAt} > ${t.createdAt}
      AND (${t.anonymousOwnerHash} IS NULL OR ${t.expiresAt} <= ${t.createdAt} + interval '30 days')
    )`
  ),
  legacyShape: check(
    'routine_results_legacy_shape',
    sql`${t.schemaVersion} >= 1 OR (${t.anonymousOwnerHash} IS NULL AND ${t.consentId} IS NULL)`
  ),
  consent: foreignKey({
    name: 'routine_results_consent_fk',
    columns: [t.consentId, t.consentPurpose],
    foreignColumns: [consentRecords.id, consentRecords.purpose],
  }).onDelete('restrict'),
}));

/**
 * The normalised seven-day schedule of a saved routine: one row per step,
 * written in the same transaction as the result snapshot. Exactly one of a
 * catalogue product (with its SKU) or an owned item.
 */
export const routineScheduleSlots = pgTable('routine_schedule_slots', {
  routineId: text('routine_id').notNull().references(() => routineResults.id, { onDelete: 'cascade' }),
  day: smallint('day').notNull(),
  session: text('session').notNull(),
  position: smallint('position').notNull(),
  role: text('role').notNull(),
  optional: boolean('optional').notNull(),
  productId: text('product_id'),
  skuId: text('sku_id'),
  ownedItemId: text('owned_item_id'),
}, (t) => ({
  pk: primaryKey({ columns: [t.routineId, t.day, t.session, t.position] }),
  day: check('routine_schedule_slots_day', sql`${t.day} BETWEEN 1 AND 7`),
  session: check('routine_schedule_slots_session', sql`${t.session} IN ('am', 'pm')`),
  position: check('routine_schedule_slots_position', sql`${t.position} BETWEEN 1 AND 10`),
  item: check(
    'routine_schedule_slots_item',
    sql`(${t.productId} IS NOT NULL AND ${t.skuId} IS NOT NULL AND ${t.ownedItemId} IS NULL)
      OR (${t.productId} IS NULL AND ${t.skuId} IS NULL AND ${t.ownedItemId} IS NOT NULL)`
  ),
}));

/**
 * One hosted or local scan, under a photo-processing consent. Observations
 * expire within 7 days; a hosted photo's private object within 24 hours.
 * Object keys are private storage keys, never URLs. Progress-photo storage
 * stays disabled: nothing here keeps a photo beyond its 24 hours.
 */
export const scanSessions = pgTable('scan_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousOwnerHash: text('anonymous_owner_hash'),
  consentId: uuid('consent_id').notNull(),
  consentPurpose: text('consent_purpose').notNull().default('photo_processing'),
  status: text('status').notNull().default('created'),
  mode: text('mode').notNull(),
  modelVersion: text('model_version'),
  quality: jsonb('quality'),
  result: jsonb('result'),
  objectKey: text('object_key'),
  objectExpiresAt: timestamp('object_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  oneOwner: check('scan_sessions_one_owner', oneOwner(t.userId, t.anonymousOwnerHash)),
  hashShape: check('scan_sessions_hash_shape', hashShape(t.anonymousOwnerHash)),
  purpose: check('scan_sessions_consent_purpose', sql`${t.consentPurpose} = 'photo_processing'`),
  status: check(
    'scan_sessions_status',
    sql`${t.status} IN ('created', 'uploaded', 'queued', 'processing', 'completed', 'failed', 'expired', 'revoked')`
  ),
  mode: check('scan_sessions_mode', sql`${t.mode} IN ('local', 'hosted')`),
  expiry: check(
    'scan_sessions_expiry',
    sql`${t.expiresAt} > ${t.createdAt} AND ${t.expiresAt} <= ${t.createdAt} + interval '7 days'`
  ),
  privateObject: check(
    'scan_sessions_private_object',
    sql`${t.objectKey} IS NULL OR (
      ${t.mode} = 'hosted'
      AND ${t.objectKey} LIKE 'private/scans/%' AND ${t.objectKey} NOT LIKE '%..%'
      AND ${t.objectExpiresAt} IS NOT NULL AND ${t.objectExpiresAt} <= ${t.createdAt} + interval '24 hours'
    )`
  ),
  consent: foreignKey({
    name: 'scan_sessions_consent_fk',
    columns: [t.consentId, t.consentPurpose],
    foreignColumns: [consentRecords.id, consentRecords.purpose],
  }).onDelete('restrict'),
  userIdx: index('scan_sessions_user_idx').on(t.userId, t.createdAt),
  guestIdx: index('scan_sessions_guest_idx').on(t.anonymousOwnerHash, t.createdAt),
  expiresIdx: index('scan_sessions_expires_idx').on(t.expiresAt),
  statusIdx: index('scan_sessions_status_idx').on(t.status, t.createdAt),
}));

/**
 * A customer's weekly report on a saved routine. Account-only, one per week
 * per routine. Bounded values; never used as a clinical training label.
 */
export const routineFeedback = pgTable('routine_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  routineId: text('routine_id').notNull().references(() => routineResults.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  week: smallint('week').notNull(),
  adherence: text('adherence').notNull(),
  tolerability: text('tolerability').notNull(),
  reportedChange: text('reported_change').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oncePerWeek: uniqueIndex('routine_feedback_once_per_week_idx').on(t.routineId, t.userId, t.week),
  userIdx: index('routine_feedback_user_idx').on(t.userId, t.createdAt),
  week: check('routine_feedback_week', sql`${t.week} BETWEEN 1 AND 52`),
  adherence: check('routine_feedback_adherence', sql`${t.adherence} IN ('every_day', 'most_days', 'some_days', 'not_at_all')`),
  tolerability: check('routine_feedback_tolerability', sql`${t.tolerability} IN ('comfortable', 'mild_discomfort', 'irritated', 'stopped')`),
  reportedChange: check('routine_feedback_change', sql`${t.reportedChange} IN ('better', 'same', 'worse', 'unsure')`),
}));

/**
 * A customer's support request from the site's consultation form. Stored
 * so staff can answer it by email; nothing is sent automatically. The
 * customer agreed to be contacted about this request only (no marketing).
 */
export const supportRequests = pgTable('support_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'),
  /** Staff note on how it was answered; never shown to the customer. */
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: text('resolved_by'),
}, (t) => ({
  status: check('support_requests_status', sql`${t.status} IN ('open', 'answered', 'closed')`),
  lengths: check('support_requests_lengths', sql`char_length(${t.name}) BETWEEN 1 AND 80 AND char_length(${t.message}) BETWEEN 1 AND 2000 AND char_length(${t.email}) BETWEEN 3 AND 254`),
  openIdx: index('support_requests_status_idx').on(t.status, t.createdAt),
}));

/**
 * Newsletter subscriptions, double opt-in. `pending` until the address
 * owner confirms by the emailed link; only `subscribed` may be sent to.
 * One random token per address (only its SHA-256 is stored) confirms and
 * unsubscribes; it is replaced on every sign-up request. The consent
 * wording version is kept as the record of what was agreed to.
 */
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  status: text('status').notNull().default('pending'),
  consentVersion: text('consent_version').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
}, (t) => ({
  status: check('newsletter_status', sql`${t.status} IN ('pending', 'subscribed', 'unsubscribed')`),
  emailShape: check('newsletter_email', sql`char_length(${t.email}) BETWEEN 3 AND 254 AND ${t.email} = lower(${t.email})`),
  tokenShape: check('newsletter_token_hash', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  emailIdx: uniqueIndex('newsletter_email_idx').on(t.email),
  tokenIdx: uniqueIndex('newsletter_token_idx').on(t.tokenHash),
}));

/**
 * Product and behavioural events.
 *
 * Deliberately schema-light: a name plus a JSON payload, so new event types do
 * not need a migration. Keep personal data out of `props`.
 */
export const activityEvents = pgTable('activity_events', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  anonymousId: text('anonymous_id'),
  sessionId: text('session_id'),
  name: text('name').notNull(),
  props: jsonb('props'),
  path: text('path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: index('activity_name_idx').on(t.name),
  userIdx: index('activity_user_idx').on(t.userId),
  createdIdx: index('activity_created_idx').on(t.createdAt),
}));

/* -------------------------------------------------------------------------- */
/* Inventory                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Stock, held per product *and* size, because a 30ml and a 50ml of the same
 * serum are different physical things.
 *
 * Stock lives here rather than in the catalogue file because it changes with
 * every order; a value compiled into the bundle could not be decremented and
 * would need a redeploy to correct.
 *
 * `quantity` is the number on hand. It is decremented inside the same
 * transaction that writes the order, under a `quantity >= n` guard, so two
 * simultaneous orders for the last unit cannot both succeed.
 */
export const inventory = pgTable('inventory', {
  id: serial('id').primaryKey(),
  productId: text('product_id').notNull(),
  size: text('size').notNull(),
  variantId: text('variant_id').references(() => catalogVariants.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull().default(0),
  /** Below this, the storefront shows a low-stock notice. */
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  /** Lets a SKU be sold past zero deliberately (made to order, pre-order). */
  allowBackorder: boolean('allow_backorder').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('inventory_product_size_idx').on(t.productId, t.size),
  variantIdx: uniqueIndex('inventory_variant_idx').on(t.variantId),
}));

/* -------------------------------------------------------------------------- */
/* Restock requests                                                             */
/* -------------------------------------------------------------------------- */

/**
 * "We are running out of this — order more."
 *
 * Raised by the inventory manager, who sees the shelf, and read by the owner,
 * who does the buying. It exists because those are two different people: the
 * manager cannot place a purchase order and the owner cannot see the shelf, so
 * without a record the request lives in a WhatsApp message and gets lost.
 *
 * The quantity on hand at the time of the request is captured, not looked up
 * later. By the time anyone reads it the shelf has moved, and "we asked when
 * there were 3 left" is the part that makes the request judgeable.
 */
export const restockRequests = pgTable('restock_requests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull(),
  size: text('size').notNull(),
  variantId: text('variant_id').references(() => catalogVariants.id, { onDelete: 'restrict' }),
  /** How many the manager is asking for. */
  requestedQuantity: integer('requested_quantity').notNull(),
  /** Stock on hand when the request was raised. */
  quantityAtRequest: integer('quantity_at_request').notNull(),
  note: text('note'),
  status: text('status').notNull().default('open'),
  requestedBy: text('requested_by').notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index('restock_status_idx').on(t.status),
  skuIdx: index('restock_sku_idx').on(t.productId, t.size),
  variantIdx: index('restock_variant_idx').on(t.variantId),
}));

/* -------------------------------------------------------------------------- */
/* Pricing and offers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Owner-set prices and offers, overriding the catalogue file.
 *
 * Prices live in `data/mock-data.ts`, which is compiled into the bundle — so
 * changing one is a code edit and a redeploy, which is not a thing a shop
 * owner can do on a Friday evening. A row here wins over the file for that
 * product and size.
 *
 * Money is integer paise, like everywhere else. A price stored as 12.99 in a
 * float is a rounding error waiting to become a wrong total.
 */
export const productPricing = pgTable('product_pricing', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull(),
  size: text('size').notNull(),
  variantId: text('variant_id').references(() => catalogVariants.id, { onDelete: 'restrict' }),
  /** Replaces the catalogue price, in paise. */
  price: integer('price').notNull(),
  /**
   * Discounted price, in paise. Null means no offer running.
   *
   * Kept separate from `price` rather than overwriting it, so the struck-out
   * original still has something to show and ending an offer does not need the
   * old price to be remembered by hand.
   */
  salePrice: integer('sale_price'),
  /** Shown on the badge, e.g. "Festive 20% off". */
  offerLabel: text('offer_label'),
  offerStartsAt: timestamp('offer_starts_at', { withTimezone: true }),
  offerEndsAt: timestamp('offer_ends_at', { withTimezone: true }),
  updatedBy: text('updated_by'),
  /**
   * Optimistic concurrency. Every save names the version it edited; a save
   * against a stale version is refused rather than silently overwriting a
   * colleague's change made in the meantime.
   */
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('product_pricing_sku_idx').on(t.productId, t.size),
  variantIdx: uniqueIndex('product_pricing_variant_idx').on(t.variantId),
}));

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fixed-window request counters.
 *
 * Kept in Postgres rather than process memory because serverless instances are
 * numerous and short-lived: an in-memory counter resets on every cold start and
 * is not shared between instances, so an attacker spreading attempts across
 * instances would never hit a limit. Redis/ElastiCache would be faster and is
 * the natural upgrade after the AWS move; the interface in lib/rate-limit.ts
 * does not change.
 */
export const rateLimits = pgTable('rate_limits', {
  /** Bucket key, e.g. "admin-login:203.0.113.7". */
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  /** Start of the current window. */
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
  /** Window length of the policy that wrote this row; null for rows from before 0018. */
  windowSeconds: integer('window_seconds'),
}, (t) => ({
  windowIdx: index('rate_limits_window_idx').on(t.windowStart),
}));

/* -------------------------------------------------------------------------- */
/* Relations                                                                    */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  orders: many(orders),
  addresses: many(addresses),
  reviews: many(reviews),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
}));

/* -------------------------------------------------------------------------- */
/* Domain events — the outbox                                                   */
/* -------------------------------------------------------------------------- */

/**
 * An append-only log of things that happened, written in the same transaction
 * as the thing itself.
 *
 * This is the free-tier stand-in for a broker. The property that actually
 * matters is not throughput, it is that the order row and the "an order was
 * placed" fact commit together: an event can never describe an order that
 * rolled back, and an order can never exist with its event lost. A queue
 * written to *after* the transaction gives up exactly that guarantee, and it
 * fails in the worst possible way — silently, only under load.
 *
 * What this deliberately is not:
 *  - Partitioned. One shop, one ordering. Global order is a feature here.
 *  - Retained forever. Rows are pruned once every consumer is past them.
 *  - High throughput. A few hundred events a day fits in a table trivially.
 *
 * Replay works the same way it does on a broker: reset a consumer's offset and
 * the history is re-read. That is the reason for a log rather than a job queue
 * — a risk model that gets retuned needs to re-score last week.
 */
export const domainEvents = pgTable('domain_events', {
  /**
   * Offset. Monotonic per insert — but see `readEvents`: an id is assigned at
   * insert and becomes visible at commit, so ids can appear out of order.
   */
  id: serial('id').primaryKey(),
  /** Dotted name, e.g. `order.placed`. */
  name: text('name').notNull(),
  /** What the event is about — an order id — for correlation and replay. */
  subject: text('subject'),
  payload: jsonb('payload').notNull(),
  /** The request that caused this, so one checkout can be followed through every consumer. */
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: index('domain_events_name_idx').on(t.name),
  createdIdx: index('domain_events_created_idx').on(t.createdAt),
}));

/**
 * One row per (event, consumer): proof that this consumer handled this event.
 *
 * Deliberately not a watermark. A single "read up to id N" counter looks
 * cheaper and is subtly wrong here: `serial` assigns ids at insert but rows
 * appear at commit, so a transaction holding id 41 can commit after one
 * holding 42. A consumer that stored 42 would skip 41 permanently — and only
 * under concurrency, which is to say only in production. Avoiding it needs a
 * delay before reading, and a delay is the one thing the fast path cannot
 * afford.
 *
 * Recording deliveries individually means nothing ever advances past an
 * unfinished event, because nothing advances at all. The cost is a row per
 * event per consumer and the loss of strict ordering — neither matters for a
 * notifier, a risk gate or a cache invalidation, none of which care which of
 * two orders arrived first.
 */
export const eventDeliveries = pgTable('event_deliveries', {
  eventId: integer('event_id')
    .notNull()
    .references(() => domainEvents.id, { onDelete: 'cascade' }),
  consumer: text('consumer').notNull(),
  /**
   * `done`, `failed` (will be retried) or `dead` (retries exhausted). `dead`
   * is the dead-letter state: shown in the operations console and replayable.
   */
  status: text('status').notNull().default('done'),
  attempts: integer('attempts').notNull().default(1),
  lastError: text('last_error'),
  /** Earliest time a failed delivery may be tried again. Exponential backoff. */
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.eventId, t.consumer] }),
  pending: index('event_deliveries_consumer_idx').on(t.consumer, t.status),
}));

/**
 * Where each consumer started.
 *
 * A newly deployed consumer must not replay the entire history on first boot —
 * for the notifier that means emailing every customer who has ever ordered.
 * It registers at the current head instead, and everything before that is
 * simply not its business. Replay stays a deliberate act: lower this number,
 * or delete the delivery rows you want redone.
 */
export const consumerRegistrations = pgTable('consumer_registrations', {
  consumer: text('consumer').primaryKey(),
  startEventId: integer('start_event_id').notNull().default(0),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Environmental conditions                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Current conditions per region, refreshed lazily.
 *
 * Keyed by a coarse region derived from the PIN code the customer already
 * gives at checkout, not by browser geolocation — that costs a permission
 * prompt most people decline, for data already on file.
 *
 * Regional rather than per-pincode on purpose. UV index and humidity do not
 * differ meaningfully across a postal circle, and ~25 rows refreshed hourly is
 * a table lookup, whereas 19,000 pincodes would be a synchronisation project.
 *
 * These are outdoor conditions for a wide area. They are a *prior* about the
 * customer's environment, never a measurement of their exposure — someone in
 * an air-conditioned office in Delhi is not living in Delhi's humidity. Every
 * message built on this data has to be phrased accordingly.
 */
export const environmentalCache = pgTable('environmental_cache', {
  /** Region key from `regionForPincode`, e.g. 'IN-MH'. */
  region: text('region').primaryKey(),
  /** Peak UV index forecast for today. Null when the provider had no value. */
  uvIndex: integer('uv_index'),
  /** Relative humidity, percent. */
  humidity: integer('humidity'),
  /** PM2.5, micrograms per cubic metre. */
  pm25: integer('pm25'),
  /** When this was last successfully fetched — the staleness check reads it. */
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Ingredients and interactions                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One row per active ingredient the engine knows how to reason about.
 *
 * Molecule-level, not class-level. "Retinoid" is not a row, because the rule
 * that benzoyl peroxide degrades tretinoin does not hold for adapalene — which
 * is photostable and co-formulated with benzoyl peroxide deliberately. A
 * class-wide rule would warn people off a combination dermatologists
 * prescribe on purpose.
 */
export const ingredients = pgTable('ingredients', {
  /** Stable slug, e.g. 'tretinoin'. */
  id: text('id').primaryKey(),
  /** INCI name as it appears on a label. */
  inciName: text('inci_name').notNull(),
  /** What a customer would call it. */
  commonName: text('common_name').notNull(),
  /** Other label spellings, for matching an ingredient list. */
  synonyms: jsonb('synonyms').notNull().default(sql`'[]'::jsonb`),
  /** True when this is normally prescription-only in India. */
  prescriptionOnly: boolean('prescription_only').notNull().default(false),
  /**
   * Contraindicated in pregnancy.
   *
   * Kept as a column rather than an interaction because it is a property of
   * the molecule alone, and because it outranks every pairwise rule: a
   * teratogen warning must not depend on what else is in the routine.
   */
  pregnancyCaution: boolean('pregnancy_caution').notNull().default(false),
  /** Raises photosensitivity, so the UV forecast becomes relevant. */
  photosensitising: boolean('photosensitising').notNull().default(false),
  /** Ingredient class (retinoid, aha, ...), as in modules/ingredients/dictionary. */
  class: text('class').notNull().default('other'),
}, (t) => ({
  inciIdx: index('ingredients_inci_idx').on(t.inciName),
}));

/**
 * A documented interaction between two specific molecules.
 *
 * Tiered by evidence, because merging a pharmacological fact with a folk
 * heuristic drags the fact down to the heuristic's credibility. Every Tier 2
 * row carries a citation; a rule that cannot be cited belongs in Tier 3 or
 * nowhere.
 */
/**
 * Normalised label → canonical ingredient, or an explicit ambiguity.
 *
 * Exactly one of `ingredient_id` (resolves) and `ambiguous_candidates`
 * (never resolves) is set. The primary key makes an alias mean one thing;
 * a label that could mean two is stored as ambiguous rather than picked.
 * Written by `npm run db:import-knowledge` from the dictionary module.
 */
export const ingredientAliases = pgTable('ingredient_aliases', {
  alias: text('alias').primaryKey(),
  ingredientId: text('ingredient_id').references(() => ingredients.id, { onDelete: 'cascade' }),
  ambiguousCandidates: jsonb('ambiguous_candidates'),
}, (t) => ({
  ingredientIdx: index('ingredient_aliases_ingredient_idx').on(t.ingredientId),
  oneMeaning: check('ingredient_aliases_one_meaning', sql`(${t.ingredientId} IS NULL) <> (${t.ambiguousCandidates} IS NULL)`),
}));

/** Where a formulation fact or approved direction came from. */
export const evidenceSources = pgTable('evidence_sources', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url'),
  sourceType: text('source_type').notNull(),
  retrievedAt: text('retrieved_at').notNull(),
  limitations: text('limitations').notNull(),
}, (t) => ({
  httpsOnly: check('evidence_sources_https', sql`${t.url} IS NULL OR ${t.url} LIKE 'https://%'`),
  sourceType: check('evidence_sources_type', sql`${t.sourceType} IN ('formulation_dossier', 'label', 'regulation', 'literature', 'clinician_note')`),
}));

/**
 * One version of a finished product's formula. Coverage says how much of it
 * is actually known; `complete` requires the declared INCI list.
 */
export const formulations = pgTable('formulations', {
  /** `productId@vN` */
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => catalogProducts.id, { onDelete: 'restrict' }),
  version: integer('version').notNull(),
  coverage: text('coverage').notNull(),
  fullInci: text('full_inci'),
  sourceId: text('source_id').notNull().references(() => evidenceSources.id, { onDelete: 'restrict' }),
  reviewedBy: text('reviewed_by').notNull(),
  reviewedAt: text('reviewed_at').notNull(),
}, (t) => ({
  productVersion: uniqueIndex('formulations_product_version_idx').on(t.productId, t.version),
  coverage: check('formulations_coverage', sql`${t.coverage} IN ('complete', 'partial', 'unknown')`),
  completeHasInci: check('formulations_complete_has_inci', sql`${t.coverage} <> 'complete' OR ${t.fullInci} IS NOT NULL`),
  version: check('formulations_version_positive', sql`${t.version} >= 1`),
}));

/** Each declared INCI position, its canonical ingredient if known, and its concentration if known. */
export const formulationIngredients = pgTable('formulation_ingredients', {
  formulationId: text('formulation_id').notNull().references(() => formulations.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(),
  inciLabel: text('inci_label').notNull(),
  ingredientId: text('ingredient_id').references(() => ingredients.id, { onDelete: 'restrict' }),
  concentrationKnown: boolean('concentration_known').notNull().default(false),
  concentration: numeric('concentration', { precision: 9, scale: 4 }),
  unit: text('unit'),
}, (t) => ({
  pk: primaryKey({ columns: [t.formulationId, t.position] }),
  ingredientIdx: index('formulation_ingredients_ingredient_idx').on(t.ingredientId),
  knownMeansValued: check(
    'formulation_ingredients_concentration',
    sql`(${t.concentrationKnown} AND ${t.concentration} > 0 AND ${t.unit} IN ('percent_w_w', 'percent_w_v', 'mg_per_g', 'mg_per_ml')
        AND (${t.unit} NOT LIKE 'percent%' OR ${t.concentration} <= 100))
     OR (NOT ${t.concentrationKnown} AND ${t.concentration} IS NULL AND ${t.unit} IS NULL)`
  ),
  position: check('formulation_ingredients_position', sql`${t.position} >= 1`),
}));

/** Approved, product-specific directions for one formulation version. */
export const usageProfiles = pgTable('usage_profiles', {
  formulationId: text('formulation_id').primaryKey().references(() => formulations.id, { onDelete: 'restrict' }),
  session: text('session').notNull(),
  frequency: text('frequency').notNull(),
  directions: text('directions').notNull(),
  maxWeeklyUses: smallint('max_weekly_uses'),
  evidenceIds: jsonb('evidence_ids').notNull().default(sql`'[]'::jsonb`),
  reviewedBy: text('reviewed_by').notNull(),
  reviewedAt: text('reviewed_at').notNull(),
}, (t) => ({
  session: check('usage_profiles_session', sql`${t.session} IN ('am', 'pm', 'am_or_pm')`),
  weekly: check('usage_profiles_weekly', sql`${t.maxWeeklyUses} IS NULL OR ${t.maxWeeklyUses} BETWEEN 1 AND 14`),
}));

export const ingredientInteractions = pgTable('ingredient_interactions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ingredientA: text('ingredient_a').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  ingredientB: text('ingredient_b').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  /** 2 = established deactivation, 3 = additive irritation, 4 = sequencing. */
  tier: integer('tier').notNull(),
  /** Shown to the customer. Plain language, no hedging, no jargon. */
  summary: text('summary').notNull(),
  /** What to actually do — the part that makes the warning useful. */
  advice: text('advice').notNull(),
  /** Source. Required for tier 2; a rule without one is not tier 2. */
  citation: text('citation'),
}, (t) => ({
  pairIdx: uniqueIndex('interactions_pair_idx').on(t.ingredientA, t.ingredientB),
}));

/**
 * What a customer says they are currently using.
 *
 * Products from any brand, not just this shop's six — which is the point. The
 * engine's job is to make someone's whole routine safe, and a warning that
 * only covers your own catalogue is marketing rather than a safety tool.
 */
export const routineItems = pgTable('routine_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Free text as the customer typed it — brand and product name. */
  label: text('label').notNull(),
  /** Resolved ingredient ids. Empty until someone tells us what is in it. */
  ingredientIds: jsonb('ingredient_ids').notNull().default(sql`'[]'::jsonb`),
  /** Set when the customer says a doctor prescribed this. */
  prescribed: boolean('prescribed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('routine_items_user_idx').on(t.userId),
}));


/* -------------------------------------------------------------------------- */
/* Idempotency                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One row per completed idempotent command.
 *
 * The guarantee is the unique index on (scope, key), not any read. The claim is
 * inserted inside the same transaction as the command's own writes, so a
 * concurrent duplicate blocks on the index until the first commits, then sees
 * the finished row and returns its stored result. If the command fails, its
 * transaction rolls back and takes the claim with it, so a retry is allowed.
 *
 * `request_hash` catches a key reused with a different payload, a client bug
 * that would otherwise hand one caller another caller's result.
 */
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  scope: text('scope').notNull(),
  key: text('key').notNull(),
  requestHash: text('request_hash').notNull(),
  status: text('status').notNull().default('completed'),
  responseCode: integer('response_code'),
  responseBody: jsonb('response_body'),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (t) => ({
  scopeKey: uniqueIndex('idempotency_scope_key_idx').on(t.scope, t.key),
  expiresIdx: index('idempotency_expires_idx').on(t.expiresAt),
}));

/* -------------------------------------------------------------------------- */
/* Audit trail                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Who changed what, from what, to what.
 *
 * Separate from `domain_events` on purpose. Events are facts the system reacts
 * to; this is a record kept for people, such as the owner asking why a price
 * moved or an accountant asking who issued a refund. Append-only by convention
 * and never read by application logic.
 */
export const auditLogs = pgTable('audit_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actor: text('actor').notNull(),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  reason: text('reason'),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: index('audit_entity_idx').on(t.entityType, t.entityId),
  createdIdx: index('audit_created_idx').on(t.createdAt),
}));

/* -------------------------------------------------------------------------- */
/* Payment provider events                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every webhook the payment provider has sent, deduplicated by its own id.
 *
 * Delivery is at-least-once and unordered. The unique index answers "have we
 * handled this exact event" without trusting a read, and the stored payload is
 * what reconciliation and support look at when the order and the provider
 * disagree.
 */
export const paymentEvents = pgTable('payment_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  eventType: text('event_type').notNull(),
  orderId: text('order_id'),
  providerPaymentId: text('provider_payment_id'),
  amount: integer('amount'),
  payload: jsonb('payload').notNull(),
  /** What the state machine did with it: applied, ignored, rejected, attention. */
  outcome: text('outcome'),
  requestId: text('request_id'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  providerEventIdx: uniqueIndex('payment_events_provider_event_idx').on(t.provider, t.providerEventId),
  orderIdx: index('payment_events_order_idx').on(t.orderId),
}));


/* -------------------------------------------------------------------------- */
/* Wishlist                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Saved products, for signed-in customers.
 *
 * The wishlist lived only in the browser, so it vanished with cleared storage
 * or a new device. Postgres is now the record for anyone signed in; the
 * browser copy is a fast local mirror, and Redis, where configured, is a read
 * cache in front of this table — never the only copy.
 */
export const wishlistItems = pgTable('wishlist_items', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.productId] }),
}));

/* -------------------------------------------------------------------------- */
/* Content (CMS)                                                                */
/* -------------------------------------------------------------------------- */

export const contentStatus = pgEnum('content_status', ['draft', 'published', 'archived']);

/**
 * One piece of editable content: a product's copy, a journal article.
 *
 * A document carries two bodies. `draft` is what the editor is working on;
 * `published` is what customers see, and changes only when someone presses
 * publish. Editing never touches the live page, so a half-written paragraph
 * is never on the storefront.
 *
 * `version` counts draft saves and is the optimistic-concurrency token: a save
 * carries the version it was loaded at, and a stale one is refused rather than
 * silently overwriting someone else's edit. `published_version` records which
 * draft version is live, so "unpublished changes" is `version > published_version`.
 *
 * `(type, slug)` is unique: a product has one copy document, an article one URL.
 */
export const cmsDocuments = pgTable('cms_documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** `product_copy` or `article`; each has its own field schema in code. */
  type: text('type').notNull(),
  slug: text('slug').notNull(),
  status: contentStatus('status').notNull().default('draft'),
  draft: jsonb('draft').notNull(),
  published: jsonb('published'),
  version: integer('version').notNull().default(1),
  publishedVersion: integer('published_version'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
}, (t) => ({
  typeSlug: uniqueIndex('cms_documents_type_slug_idx').on(t.type, t.slug),
  statusIdx: index('cms_documents_status_idx').on(t.type, t.status),
}));

/**
 * Every saved version of every document, append-only.
 *
 * What makes rollback possible: restoring revision 4 copies its body into a
 * new draft (version 7, say), so history is never rewritten and the rollback
 * itself shows up as a revision.
 */
export const cmsRevisions = pgTable('cms_revisions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  documentId: text('document_id')
    .notNull()
    .references(() => cmsDocuments.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  body: jsonb('body').notNull(),
  /** `save`, `publish`, `unpublish` or `restore`. */
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  docVersion: index('cms_revisions_doc_idx').on(t.documentId, t.version),
}));

/**
 * Uploaded media. The bytes live in object storage; this row is the index.
 *
 * `storage_key` is content-addressed (derived from the SHA-256 of the bytes),
 * so uploading the same image twice stores it once, and a retried upload is
 * harmless.
 */
export const mediaAssets = pgTable('media_assets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  sha256: text('sha256').notNull(),
  alt: text('alt').notNull().default(''),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  keyIdx: uniqueIndex('media_assets_storage_key_idx').on(t.storageKey),
}));

/* -------------------------------------------------------------------------- */
/* Background jobs                                                              */
/* -------------------------------------------------------------------------- */

export const jobStatus = pgEnum('job_status', ['queued', 'running', 'succeeded', 'dead']);

/**
 * Work that must happen, but not while a customer waits for it.
 *
 * A queue in Postgres rather than a broker: one shop's background work is a
 * few hundred rows a day, and a job enqueued inside a transaction commits
 * or rolls back with the change that caused it, which no external queue can
 * offer without an outbox of its own.
 *
 * Workers claim with `FOR UPDATE SKIP LOCKED`, so two workers never take the
 * same job, and hold it until `locked_until`. A worker that dies mid-job
 * simply lets the lock lapse and the job is claimed again. Completing or
 * failing a job checks `locked_by`, so a slow worker whose lock expired
 * cannot overwrite the result of the worker that took over.
 *
 * `dedupe_key` is unique among queued and running jobs only: "reconcile
 * order X" can be enqueued many times but exists at most once in flight, and
 * can be enqueued again after it finishes.
 */
export const jobs = pgTable('jobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  status: jobStatus('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lockedBy: text('locked_by'),
  lastError: text('last_error'),
  dedupeKey: text('dedupe_key'),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  claimIdx: index('jobs_claim_idx').on(t.status, t.runAt),
  dedupeIdx: uniqueIndex('jobs_dedupe_in_flight_idx')
    .on(t.dedupeKey)
    .where(sql`${t.dedupeKey} is not null and ${t.status} in ('queued', 'running')`),
}));

/**
 * How far an export has read the event log. One row per export.
 *
 * Unlike event consumers this *is* a watermark, and safely so: the export
 * only reads events more than a few minutes old, by which time every
 * transaction that could have taken a lower id has long since committed.
 */
export const exportWatermarks = pgTable('export_watermarks', {
  name: text('name').primaryKey(),
  lastEventId: integer('last_event_id').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Knowledge releases                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Compiled knowledge releases (modules/knowledge/compile.ts). A release is
 * immutable once stored: its manifest, artifacts and checksum can never
 * change, only its status (`stored` → `published` → `revoked`, or
 * `stored` → `revoked`). Old releases are kept for traceability; saved
 * routines record the release they were computed with.
 *
 * Artifacts are stored inline (each is small JSON); the spec's artifact_key
 * for object storage can replace this without changing the contract.
 */
export const kbReleases = pgTable('kb_releases', {
  id: text('id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  isFixture: boolean('is_fixture').notNull(),
  status: text('status').notNull().default('stored'),
  manifest: jsonb('manifest').notNull(),
  /** Artifact name → canonical JSON text, exactly as hashed. */
  artifacts: jsonb('artifacts').notNull(),
  /** SHA-256 of the canonical manifest. */
  checksum: text('checksum').notNull(),
  storedBy: text('stored_by').notNull(),
  storedAt: timestamp('stored_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedReason: text('revoked_reason'),
}, (t) => ({
  status: check('kb_releases_status', sql`${t.status} IN ('stored', 'published', 'revoked')`),
  revokedHasReason: check('kb_releases_revoked_reason', sql`${t.status} <> 'revoked' OR (${t.revokedAt} IS NOT NULL AND ${t.revokedReason} IS NOT NULL)`),
  statusIdx: index('kb_releases_status_idx').on(t.status, t.storedAt),
}));

/**
 * The one active release. A single row (the primary key can only be true);
 * activation and rollback replace it in the same transaction as the status
 * change and audit record. A trigger refuses fixture and revoked releases.
 */
export const kbActiveRelease = pgTable('kb_active_release', {
  singleton: boolean('singleton').primaryKey().default(true),
  releaseId: text('release_id').notNull().references(() => kbReleases.id, { onDelete: 'restrict' }),
  previousReleaseId: text('previous_release_id').references(() => kbReleases.id, { onDelete: 'restrict' }),
  activatedBy: text('activated_by').notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  singleton: check('kb_active_release_singleton', sql`${t.singleton}`),
}));

/* -------------------------------------------------------------------------- */
/* Hosted scan admission and billable attempts                                   */
/* -------------------------------------------------------------------------- */

/**
 * One row per admitted hosted scan: the durable record the daily, rolling
 * 30-day, per-IP and global admission budgets are counted from. Kept beside
 * the scan rather than in a cache, so no outage can reset the spend cap, and
 * outliving it: deleting an expired scan must not shrink the 30-day count.
 * `ip_key` is a keyed hash, never the address.
 */
export const scanAdmissions = pgTable('scan_admissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Set null when the scan expires and is deleted: the admission must still count. */
  scanSessionId: uuid('scan_session_id').references(() => scanSessions.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousOwnerHash: text('anonymous_owner_hash'),
  ipKey: text('ip_key'),
  admittedAt: timestamp('admitted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oneOwner: check('scan_admissions_one_owner', sql`num_nonnulls(${t.userId}, ${t.anonymousOwnerHash}) = 1`),
  userIdx: index('scan_admissions_user_idx').on(t.userId, t.admittedAt),
  guestIdx: index('scan_admissions_guest_idx').on(t.anonymousOwnerHash, t.admittedAt),
  ipIdx: index('scan_admissions_ip_idx').on(t.ipKey, t.admittedAt),
  admittedIdx: index('scan_admissions_admitted_idx').on(t.admittedAt),
}));

/**
 * Billable inference attempts. The primary key and the CHECK make the
 * per-scan budget (at most 2 attempts) a database fact: a third attempt,
 * or a duplicate of one, cannot be recorded, so it cannot be billed.
 */
export const scanAttempts = pgTable('scan_attempts', {
  scanSessionId: uuid('scan_session_id').notNull().references(() => scanSessions.id, { onDelete: 'cascade' }),
  attempt: smallint('attempt').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.scanSessionId, t.attempt] }),
  budget: check('scan_attempts_budget', sql`${t.attempt} BETWEEN 1 AND 2`),
  startedIdx: index('scan_attempts_started_idx').on(t.startedAt),
}));
