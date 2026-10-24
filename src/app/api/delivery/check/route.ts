import { trustedClientIp } from '@/lib/client-ip';
import { limit, limitResponse } from '@/lib/rate-limit';
import { checkServiceability } from '@/modules/shipping/shiprocket';

export const dynamic = 'force-dynamic';

/**
 * Can we deliver to this PIN code, and take cash there?
 *
 * For checkout to say so while the customer types, instead of after they
 * press Place order. Placing the order checks again; this only answers early.
 * `{ known: false }` when Shiprocket is not set up or did not answer.
 */
export async function GET(request: Request) {
  const pin = new URL(request.url).searchParams.get('pin') ?? '';
  if (!/^\d{6}$/.test(pin)) return Response.json({ error: 'Enter a 6-digit PIN code.' }, { status: 400 });
  const limited = await limit([
    { policy: 'deliveryCheck', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);
  const result = await checkServiceability(pin);
  return Response.json(result ? { known: true, ...result } : { known: false }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
