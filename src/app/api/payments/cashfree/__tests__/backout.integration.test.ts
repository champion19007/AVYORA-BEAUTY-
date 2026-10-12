import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { inventory, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Backing out of the payment screen must not leave an order behind.
 *
 * Cashfree is a fake here (`cf` below) that behaves as its API documents:
 * an order is ACTIVE until paid, TERMINATED on request unless a payment is
 * in progress, and its payments are listed separately.
 */

const { client, db } = await createMigratedDb();

vi.mock('@/db', () => ({
  db,
  getDatabase: () => db,
  isDatabaseConfigured: () => true,
}));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: () => {},
}));
vi.mock('@/auth', () => ({ auth: async () => null }));
const notified = vi.fn(async () => ({
  customer: { ok: true },
  owner: { ok: true },
}));
vi.mock('@/lib/order-notifications', () => ({ notifyOrderPlaced: notified }));
vi.mock('@/lib/storefront-cache', () => ({
  revalidateContent: async () => {},
  revalidateProduct: async () => {},
}));

const cf = {
  status: new Map<string, string>(),
  payments: new Map<string, { cf_payment_id: string; payment_amount: number; payment_status: string }[]>(),
  /** A payment is in progress: Cashfree refuses to terminate. */
  busy: false,
};

vi.stubGlobal(
  'fetch',
  vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const m = /\/pg\/orders(?:\/([^/]+))?(\/payments)?$/.exec(url);
    if (!m) throw new Error(`unexpected fetch ${url}`);
    const id = m[1] ? decodeURIComponent(m[1]) : null;
    if (!id && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      cf.status.set(body.order_id, 'ACTIVE');
      return json({
        order_id: body.order_id,
        cf_order_id: '1',
        payment_session_id: `session_${body.order_id}`,
        order_amount: body.order_amount,
        order_status: 'ACTIVE',
      });
    }
    if (id && m[2]) return json(cf.payments.get(id) ?? []);
    if (id && init?.method === 'PATCH') {
      if (cf.busy || cf.status.get(id) === 'PAID') return json({ message: 'order cannot be terminated' }, 400);
      cf.status.set(id, 'TERMINATED');
      return json({ order_id: id, order_status: 'TERMINATED' });
    }
    if (id)
      return json({
        order_id: id,
        order_status: cf.status.get(id) ?? 'ACTIVE',
      });
    throw new Error(`unexpected fetch ${url}`);
  })
);

process.env.CASHFREE_APP_ID = 'test-app';
process.env.CASHFREE_SECRET_KEY = 'test-secret';
process.env.SESSION_SECRET = 'a-test-session-secret-of-at-least-32-chars';

const { POST: create } = await import('../create/route');
const { POST: cancel } = await import('../cancel/route');
const { POST: verify } = await import('../verify/route');
const { createOrder, markOrderPaid } = await import('@/lib/orders');
const { drainAll } = await import('@/lib/event-consumers');
const { createOrderAccessToken } = await import('@/lib/order-access');

const SKU = { productId: 'retinol', size: '90ml' };
const CHECKOUT = {
  email: 'priya@example.com',
  address: {
    fullName: 'Priya Sharma',
    line1: 'Flat 402, Sunrise Residency',
    line2: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400059',
    country: 'IN',
    phone: '9876543210',
  },
  items: [{ ...SKU, quantity: 2 }],
};

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(
    new Request('http://shop.test/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

async function stock() {
  const [row] = await db
    .select()
    .from(inventory)
    .where(sql`${inventory.productId} = ${SKU.productId} and ${inventory.size} = ${SKU.size}`);
  return row.quantity;
}
async function orderRow(orderNumber: string) {
  const [row] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
  return row;
}

/** Clicks Pay: our order plus its Cashfree order, as the browser would start it. */
async function startPayment(idempotencyKey = crypto.randomUUID()) {
  const res = await post(create, {
    ...CHECKOUT,
    paymentMethod: 'cashfree',
    idempotencyKey,
  });
  const body = await res.json();
  return { res, body, idempotencyKey };
}

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(
    sql`truncate orders, order_items, addresses, inventory, domain_events, event_deliveries, idempotency_keys, payment_events, jobs, rate_limits restart identity cascade`
  );
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
  cf.status.clear();
  cf.payments.clear();
  cf.busy = false;
  notified.mockClear();
});

describe('backing out of the payment screen', () => {
  it('reserves stock while paying, then cancels the order and returns the stock', async () => {
    const { res, body } = await startPayment();
    expect(res.status).toBe(200);
    expect(await stock()).toBe(8);

    // Back on our site with no payment attempted.
    expect(await (await post(verify, { orderNumber: body.orderNumber })).json()).toMatchObject({
      status: 'not_started',
    });
    const closed = await post(cancel, {
      orderNumber: body.orderNumber,
      token: body.accessToken,
    });
    expect(await closed.json()).toEqual({
      status: 'cancelled',
      orderNumber: body.orderNumber,
    });

    expect(cf.status.get(body.orderNumber)).toBe('TERMINATED');
    expect(await orderRow(body.orderNumber)).toMatchObject({
      status: 'cancelled',
    });
    expect(await stock()).toBe(10);
  });

  it('is idempotent: closing twice returns the stock once', async () => {
    const { body } = await startPayment();
    await post(cancel, {
      orderNumber: body.orderNumber,
      token: body.accessToken,
    });
    const again = await post(cancel, {
      orderNumber: body.orderNumber,
      token: body.accessToken,
    });
    expect(await again.json()).toMatchObject({ status: 'cancelled' });
    expect(await stock()).toBe(10);
  });

  it('waits while a payment is still in progress, keeping the order and its stock', async () => {
    const { body } = await startPayment();
    cf.busy = true;
    cf.payments.set(body.orderNumber, [{ cf_payment_id: 'p1', payment_amount: 1, payment_status: 'PENDING' }]);
    const res = await post(cancel, {
      orderNumber: body.orderNumber,
      token: body.accessToken,
    });
    expect(await res.json()).toMatchObject({ status: 'pending' });
    expect(await orderRow(body.orderNumber)).toMatchObject({
      status: 'pending',
    });
    expect(await stock()).toBe(8);
  });

  it('never cancels while Cashfree will not terminate, even with no payment listed yet', async () => {
    const { body } = await startPayment();
    cf.busy = true; // e.g. a UPI request just sent to the customer's app
    const res = await post(cancel, {
      orderNumber: body.orderNumber,
      token: body.accessToken,
    });
    expect(await res.json()).toMatchObject({ status: 'pending' });
    expect(await orderRow(body.orderNumber)).toMatchObject({
      status: 'pending',
    });
    expect(await stock()).toBe(8);
  });

  it('applies a payment that succeeded instead of cancelling', async () => {
    const { body } = await startPayment();
    const total = (await orderRow(body.orderNumber)).total;
    cf.status.set(body.orderNumber, 'PAID');
    cf.payments.set(body.orderNumber, [
      {
        cf_payment_id: 'p1',
        payment_amount: total / 100,
        payment_status: 'SUCCESS',
      },
    ]);
    const res = await post(cancel, {
      orderNumber: body.orderNumber,
      token: body.accessToken,
    });
    expect(await res.json()).toMatchObject({ status: 'paid' });
    expect(await orderRow(body.orderNumber)).toMatchObject({
      paymentStatus: 'paid',
    });
    expect(await stock()).toBe(8);
  });

  it('refuses to cancel without the token issued to the paying browser', async () => {
    const { body } = await startPayment();
    const other = await createOrderAccessToken('AVY-SOMEONE');
    for (const token of [undefined, 'forged', other]) {
      expect((await post(cancel, { orderNumber: body.orderNumber, token })).status).toBe(403);
    }
    expect(await orderRow(body.orderNumber)).toMatchObject({
      status: 'pending',
    });
  });

  it('does not reopen a cancelled attempt when the same checkout is retried', async () => {
    const { body, idempotencyKey } = await startPayment();
    await post(cancel, {
      orderNumber: body.orderNumber,
      token: body.accessToken,
    });
    const retry = await startPayment(idempotencyKey);
    expect(retry.res.status).toBe(409);
    expect(retry.body).toMatchObject({ code: 'attempt_closed' });
    // A new attempt (new key) works and holds stock again.
    const fresh = await startPayment();
    expect(fresh.res.status).toBe(200);
    expect(fresh.body.orderNumber).not.toBe(body.orderNumber);
    expect(await stock()).toBe(8);
  });
});

describe('order alerts', () => {
  it('announce an online order only once it is paid, never when the customer backs out', async () => {
    const backedOut = await startPayment();
    await post(cancel, {
      orderNumber: backedOut.body.orderNumber,
      token: backedOut.body.accessToken,
    });
    await drainAll();
    expect(notified).not.toHaveBeenCalled();

    const paid = await startPayment();
    await drainAll();
    expect(notified).not.toHaveBeenCalled();
    const row = await orderRow(paid.body.orderNumber);
    await markOrderPaid(row.id, 'p1', row.total);
    await drainAll();
    expect(notified).toHaveBeenCalledTimes(1);
    expect(notified).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: paid.body.orderNumber,
        paid: true,
      })
    );
  });

  it('still announce cash on delivery when placed', async () => {
    const result = await createOrder(
      {
        ...CHECKOUT,
        paymentMethod: 'cod',
        idempotencyKey: crypto.randomUUID(),
      },
      null
    );
    expect(result.ok).toBe(true);
    await drainAll();
    expect(notified).toHaveBeenCalledTimes(1);
    expect(notified).toHaveBeenCalledWith(expect.objectContaining({ paid: false, paymentProvider: 'cod' }));
  });
});
