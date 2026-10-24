import { z } from 'zod';
import { auth } from '@/auth';
import { db, isDatabaseConfigured } from '@/db';
import { trustedClientIp } from '@/lib/client-ip';
import { limit, limitResponse } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { MAX_QUANTITY_PER_SKU } from '@/lib/cart';
import { quoteItems } from '@/modules/offers/store';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().max(100),
        size: z.string().max(40),
        quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_SKU),
      })
    )
    .max(50),
  code: z.string().trim().max(40).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
});

/**
 * The offer checkout would give this bag right now, for the checkout page to
 * show before the customer pays. Placing the order quotes again from the
 * database, so nothing here is trusted; it only shows the customer the same
 * answer early.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (!isDatabaseConfigured()) return Response.json({ applied: null, codeProblem: null });
  const limited = await limit([
    { policy: 'offerQuote', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);
  const read = await readBoundedJson(request, BODY_LIMITS.cart);
  if (!read.ok) return read.response;
  const parsed = bodySchema.safeParse(read.json);
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });

  const session = await auth().catch(() => null);
  const result = await quoteItems(db, parsed.data.items, {
    code: parsed.data.code,
    email: parsed.data.email || undefined,
    userId: session?.user?.id ?? null,
  });
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
