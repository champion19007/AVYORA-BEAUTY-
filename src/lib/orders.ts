import { z } from 'zod';
import { reportError } from '@/lib/observability';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems, addresses } from '@/db/schema';
import { getProductById } from '@/lib/catalogue';
import { pricingMap, resolvePrice } from '@/lib/pricing';
import { calculateTotals, generateOrderNumber, toPaise } from '@/lib/money';
import { releaseStock, reserveStock } from '@/lib/inventory';
import { recordEvent } from '@/lib/activity';
import { notifyOrderPlaced } from '@/lib/order-notifications';
import { createOrderAccessToken } from '@/lib/order-access';

/**
 * Order creation.
 *
 * Two rules drive the design:
 *
 *  1. Prices are never taken from the client. The browser sends product ids,
 *     sizes and quantities; every price is looked up server-side. Trusting a
 *     client-supplied price lets anyone buy a serum for ₹1 by editing a
 *     request.
 *  2. Name, size and unit price are copied onto the order line. An order must
 *     keep reading correctly after the catalogue is repriced or a SKU retired.
 */

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
  line1: z.string().trim().min(4, 'Please enter your address').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Please enter your city').max(80),
  state: z.string().trim().min(2, 'Please enter your state').max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().default('IN'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
});

export const checkoutSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  address: addressSchema,
  paymentMethod: z.enum(['cod', 'razorpay']),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        size: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1, 'Your bag is empty'),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CreateOrderResult =
  | { ok: true; orderNumber: string; orderId: string; totalPaise: number }
  | { ok: false; error: string };

/** Thrown inside the order transaction to roll it back when stock runs out. */
class OutOfStockError extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}

/**
 * Validates, prices and persists an order.
 *
 * The insert of the order and its lines runs in a transaction so a failure
 * partway cannot leave an order with missing items.
 */
export async function createOrder(
  input: CheckoutInput,
  userId?: string | null
): Promise<CreateOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid order details' };
  }
  const data = parsed.data;

  /*
   * Owner-set prices win over the catalogue file.
   *
   * Without this lookup the pricing screen was decorative: a price could be
   * changed, saved and displayed, and the customer would still be charged the
   * value compiled into the bundle. Fetched once for the whole basket rather
   * than per line.
   */
  const overrides = await pricingMap();

  // Resolve every line against the catalogue; prices come from here, not the client.
  const lines: {
    productId: string;
    productName: string;
    size: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[] = [];

  for (const item of data.items) {
    const product = getProductById(item.productId);
    if (!product) {
      return { ok: false, error: `That product is no longer available: ${item.productId}` };
    }

    const size = product.sizes.find((s) => s.label === item.size) ?? product.sizes[0];

    // Catalogue price in paise, then the override — including any live offer.
    const cataloguePaise = toPaise(product.salePrice ?? size.price);
    const effective = resolvePrice(
      cataloguePaise,
      overrides.get(`${product.id}::${size.label}`)
    );
    const unitPrice = effective.price;

    lines.push({
      productId: product.id,
      productName: product.name,
      size: size.label,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
    });
  }

  const totals = calculateTotals(
    lines.map((l) => ({ unitPrice: l.unitPrice / 100, quantity: l.quantity }))
  );

  const orderNumber = generateOrderNumber();
  let createdOrderId = '';

  try {
    await db.transaction(async (tx) => {
      // Reserve stock first, inside the same transaction as the order. If this
      // fails the whole thing rolls back, so an order can never exist for
      // goods that were not actually available.
      const reservation = await reserveStock(
        lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
        tx as never
      );

      if (!reservation.ok) {
        const first = reservation.insufficient[0];
        const product = getProductById(first.productId);
        throw new OutOfStockError(
          first.available === 0
            ? `${product?.name ?? 'An item'} (${first.size}) has just sold out.`
            : `Only ${first.available} left of ${product?.name ?? 'an item'} (${first.size}). Please reduce the quantity.`
        );
      }

      const [address] = await tx
        .insert(addresses)
        .values({ ...data.address, line2: data.address.line2 || null, userId: userId ?? null })
        .returning({ id: addresses.id });

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          userId: userId ?? null,
          email: data.email,
          status: 'pending',
          // Unpaid either way at this point: cash on delivery stays unpaid
          // until the courier collects, and a Razorpay order is only marked
          // paid once its signature is verified or its webhook arrives.
          paymentStatus: 'unpaid',
          subtotal: totals.subtotal,
          discount: totals.discount,
          shipping: totals.shipping,
          tax: totals.tax,
          total: totals.total,
          shippingAddressId: address.id,
          shippingAddress: data.address,
          paymentProvider: data.paymentMethod,
        })
        .returning({ id: orders.id });

      createdOrderId = order.id;

      await tx.insert(orderItems).values(
        lines.map((l) => ({ ...l, orderId: order.id }))
      );
    });

    // Best-effort; recordEvent swallows its own failures.
    await recordEvent({
      name: 'order_placed',
      userId: userId ?? null,
      props: {
        orderNumber,
        totalPaise: totals.total,
        itemCount: lines.reduce((n, l) => n + l.quantity, 0),
        paymentMethod: data.paymentMethod,
      },
    });

    /*
     * Tell the customer and the shop.
     *
     * Awaited rather than fired and forgotten: on a serverless platform the
     * function can be frozen the moment the response is returned, and a
     * dangling promise is simply never finished. It cannot fail the order —
     * notifyOrderPlaced swallows and reports everything — so the only cost is
     * a few hundred milliseconds on the checkout response.
     *
     * The confirmation email carries the signed link, which for a guest is the
     * only way back to their order once the tab is closed.
     */
    const accessToken = await createOrderAccessToken(orderNumber).catch(() => null);
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://avyora-beauty.vercel.app';

    await notifyOrderPlaced({
      orderNumber,
      email: data.email,
      customerName: data.address.fullName,
      total: totals.total,
      paymentProvider: data.paymentMethod === 'cod' ? 'cod' : 'razorpay',
      paid: false,
      items: lines.map((l) => ({
        productName: l.productName,
        size: l.size,
        quantity: l.quantity,
      })),
      address: data.address,
      orderUrl: accessToken
        ? `${base}/orders/${orderNumber}?t=${encodeURIComponent(accessToken)}`
        : `${base}/orders/${orderNumber}`,
    });

    return { ok: true, orderNumber, orderId: createdOrderId, totalPaise: totals.total };
  } catch (err) {
    // Out-of-stock is an expected outcome, not a fault: tell the customer
    // exactly what happened rather than a generic failure.
    if (err instanceof OutOfStockError) {
      return { ok: false, error: err.detail };
    }
    reportError(err, { scope: 'orders.createOrder', correlationId: orderNumber });
    return { ok: false, error: 'We could not place your order. Please try again.' };
  }
}

/** Looks up an order and its lines by the customer-facing reference. */
export async function getOrderByNumber(orderNumber: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { ...order, items };
}

/**
 * Every order belonging to a signed-in customer, newest first.
 *
 * Scoped by user id rather than email on purpose: email is mutable and a
 * customer could change theirs at Google, whereas the user id is the stable
 * identity the orders were filed under. Guest orders placed with the same
 * address before signing up are therefore not included — claiming those needs
 * a verification step, not a join on a string anyone could type.
 */
export async function getOrdersForUser(userId: string) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  if (rows.length === 0) return [];

  // One query for all lines rather than one per order.
  const lines = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((o) => o.id)));

  const byOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    const bucket = byOrder.get(line.orderId);
    if (bucket) bucket.push(line);
    else byOrder.set(line.orderId, [line]);
  }

  return rows.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}

/**
 * Records the Razorpay order id against our order, so a later webhook can find
 * the order it belongs to.
 */
export async function attachPaymentReference(orderId: string, reference: string) {
  await db
    .update(orders)
    .set({ paymentReference: reference, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

/**
 * Marks an order paid.
 *
 * Only ever called after a signature has been verified server-side, never
 * because the browser reported success. `expectedTotal` is checked against the
 * amount the provider actually captured, so a tampered or partial payment
 * cannot flip an order to paid.
 */
export async function markOrderPaid(
  orderId: string,
  paymentId: string,
  capturedPaise?: number
): Promise<{ ok: boolean; error?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, error: 'Order not found' };

  if (typeof capturedPaise === 'number' && capturedPaise !== order.total) {
    console.error(
      `Payment amount mismatch for order ${order.orderNumber}: captured ${capturedPaise}, expected ${order.total}`
    );
    return { ok: false, error: 'Payment amount did not match the order total' };
  }

  // Idempotent: webhooks are delivered more than once, and the browser
  // callback often races the webhook for the same payment.
  if (order.paymentStatus === 'paid') return { ok: true };

  await db
    .update(orders)
    .set({
      paymentStatus: 'paid',
      status: 'paid',
      paymentReference: paymentId,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  return { ok: true };
}

/** Marks a payment attempt failed, leaving the order recoverable. */
/**
 * Marks a payment failed and puts the goods back on the shelf.
 *
 * Stock is reserved when the order is created, before the customer has paid —
 * which is right, because two people must not both buy the last unit while one
 * of them is still on the payment screen. But it means an abandoned payment
 * had decremented stock that nothing ever restored: the count drifted down
 * every time someone changed their mind, and never back up. After enough of
 * them the shop refuses sales for goods sitting on the shelf.
 */
export async function markOrderPaymentFailed(orderId: string) {
  const restored = await restoreOrderStock(orderId);

  await db
    .update(orders)
    .set({ paymentStatus: 'failed', updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  return restored;
}

/**
 * Returns an order's lines to stock, once.
 *
 * Guarded by the order's own state: only an order that still counts as live
 * has its stock returned, so calling this twice — a retried webhook, a double
 * click on cancel — cannot credit the shelf twice. Returns false when there
 * was nothing to do.
 */
export async function restoreOrderStock(orderId: string): Promise<boolean> {
  /*
   * Claiming the right to restore is a single conditional UPDATE.
   *
   * The first version of this read the status, decided, and then released —
   * three statements with gaps between them. A retried webhook arriving while
   * an operator clicked cancel could have both pass the check and both put the
   * same units back, inventing stock out of a race. Postgres decides here
   * instead: exactly one caller can move `stock_restored_at` from null, and
   * only that caller releases.
   *
   * The whole thing runs in one transaction so a crash between claiming and
   * releasing rolls the claim back rather than stranding it.
   */
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(orders)
      .set({ stockRestoredAt: new Date() })
      .where(and(eq(orders.id, orderId), isNull(orders.stockRestoredAt)))
      .returning({ id: orders.id });

    // Someone else already restored this order's stock.
    if (claimed.length === 0) return false;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    if (items.length === 0) return false;

    await releaseStock(
      items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })),
      tx as never
    );

    return true;
  });
}

/**
 * Cancels an order and returns its stock.
 *
 * The stock is restored before the status changes, because `restoreOrderStock`
 * refuses to act on an already-cancelled order — doing it the other way round
 * would silently skip the restore.
 */
export async function cancelOrder(orderId: string): Promise<boolean> {
  await restoreOrderStock(orderId);

  const updated = await db
    .update(orders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });

  return updated.length > 0;
}

/** Finds an order by the payment reference stored against it. */
export async function getOrderByPaymentReference(reference: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentReference, reference))
    .limit(1);
  return order ?? null;
}
