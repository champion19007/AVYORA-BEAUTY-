import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems, addresses } from '@/db/schema';
import { getProductById } from '@/lib/catalogue';
import { calculateTotals, generateOrderNumber, toPaise } from '@/lib/money';

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
  paymentMethod: z.enum(['cod']),
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
  | { ok: true; orderNumber: string }
  | { ok: false; error: string };

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
    const unitRupees = product.salePrice ?? size.price;
    const unitPrice = toPaise(unitRupees);

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

  try {
    await db.transaction(async (tx) => {
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
          // Cash on delivery is unpaid until the courier collects. A card or
          // UPI provider would move this to 'authorized' or 'paid' on webhook.
          paymentStatus: 'unpaid',
          subtotal: totals.subtotal,
          discount: totals.discount,
          shipping: totals.shipping,
          tax: totals.tax,
          total: totals.total,
          shippingAddressId: address.id,
          shippingAddress: data.address,
          paymentProvider: 'cod',
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        lines.map((l) => ({ ...l, orderId: order.id }))
      );
    });

    return { ok: true, orderNumber };
  } catch (err) {
    console.error('createOrder failed', err);
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
