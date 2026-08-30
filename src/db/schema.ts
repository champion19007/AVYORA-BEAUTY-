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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
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
  city: text('city').notNull(),
  state: text('state').notNull(),
  postalCode: text('postal_code').notNull(),
  country: text('country').notNull().default('IN'),
  phone: text('phone').notNull(),
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
export const carts = pgTable('carts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousId: text('anonymous_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('carts_user_idx').on(t.userId),
  anonIdx: index('carts_anon_idx').on(t.anonymousId),
}));

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: text('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  size: text('size').notNull(),
  quantity: integer('quantity').notNull().default(1),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One row per product+size per cart; quantity carries the count.
  uniq: uniqueIndex('cart_items_unique').on(t.cartId, t.productId, t.size),
}));

/* -------------------------------------------------------------------------- */
/* Orders                                                                       */
/* -------------------------------------------------------------------------- */

export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'fulfilled',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);

export const paymentStatus = pgEnum('payment_status', [
  'unpaid',
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  numberIdx: uniqueIndex('orders_number_idx').on(t.orderNumber),
  userIdx: index('orders_user_idx').on(t.userId),
  emailIdx: index('orders_email_idx').on(t.email),
  createdIdx: index('orders_created_idx').on(t.createdAt),
}));

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  /** Name and size copied in, so the order still reads correctly if a SKU is renamed or retired. */
  productName: text('product_name').notNull(),
  size: text('size').notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotal: integer('line_total').notNull(),
}, (t) => ({
  orderIdx: index('order_items_order_idx').on(t.orderId),
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
export const routineResults = pgTable('routine_results', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousId: text('anonymous_id'),
  answers: jsonb('answers').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('routine_results_user_idx').on(t.userId),
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
  quantity: integer('quantity').notNull().default(0),
  /** Below this, the storefront shows a low-stock notice. */
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  /** Lets a SKU be sold past zero deliberately (made to order, pre-order). */
  allowBackorder: boolean('allow_backorder').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('inventory_product_size_idx').on(t.productId, t.size),
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
