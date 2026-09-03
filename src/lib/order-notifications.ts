import { formatPaise } from '@/lib/money';
import { emailDeliveryConfigured, sendEmail, sendWhatsApp, whatsappConfigured } from '@/lib/notify';
import { reportError } from '@/lib/observability';

/**
 * Telling people an order happened.
 *
 * Three messages, three audiences:
 *
 *   - the customer gets a confirmation with a link back to their order, which
 *     is the only way a guest can ever reach it again;
 *   - the shop gets an email, so there is a searchable record;
 *   - the shop gets a WhatsApp, because that is what actually gets looked at.
 *
 * **Nothing here may fail an order.** The money has been taken and the row is
 * written by the time these run; a provider outage must not roll that back or
 * show the customer an error. Every send is wrapped, failures are reported and
 * swallowed, and the caller is told what happened but is not expected to act
 * on it.
 */

export type OrderNotificationInput = {
  orderNumber: string;
  email: string;
  customerName: string;
  total: number;
  paymentProvider: string | null;
  paid: boolean;
  items: { productName: string; size: string; quantity: number }[];
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  } | null;
  /** Signed link that lets a guest reopen their order. */
  orderUrl: string;
};

/** Plain-text order lines, shared by all three messages. */
function itemLines(input: OrderNotificationInput): string {
  return input.items
    .map((i) => `  ${i.quantity} x ${i.productName} (${i.size})`)
    .join('\n');
}

function addressLines(input: OrderNotificationInput): string {
  const a = input.address;
  if (!a) return 'No address on file.';

  return [
    [a.line1, a.line2].filter(Boolean).join(', '),
    [a.city, a.state, a.postalCode].filter(Boolean).join(' '),
    a.phone,
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the customer receives. */
function customerEmail(input: OrderNotificationInput) {
  const payment = input.paid
    ? 'Paid online.'
    : input.paymentProvider === 'cod'
      ? 'Cash on delivery — please keep the amount ready.'
      : 'Payment pending.';

  return {
    subject: `Your Avyora order ${input.orderNumber}`,
    text: [
      `Thank you${input.customerName ? `, ${input.customerName}` : ''}.`,
      '',
      `Order ${input.orderNumber}`,
      itemLines(input),
      '',
      `Total: ${formatPaise(input.total)}`,
      payment,
      '',
      'Delivering to:',
      addressLines(input),
      '',
      // The link is the whole point of this email for a guest: without it a
      // closed tab loses the order permanently.
      'Track your order here:',
      input.orderUrl,
      '',
      'We will email again when it is on its way.',
    ].join('\n'),
  };
}

/** What the shop receives by email. */
function ownerEmail(input: OrderNotificationInput) {
  return {
    subject: `New order ${input.orderNumber} — ${formatPaise(input.total)}`,
    text: [
      `New order ${input.orderNumber}`,
      '',
      itemLines(input),
      '',
      `Total: ${formatPaise(input.total)}`,
      `Payment: ${input.paid ? 'paid' : input.paymentProvider === 'cod' ? 'cash on delivery' : 'NOT PAID'}`,
      `Customer: ${input.customerName || '—'} <${input.email}>`,
      '',
      'Ship to:',
      addressLines(input),
    ].join('\n'),
  };
}

/**
 * What the shop receives on WhatsApp.
 *
 * Deliberately short. This is read on a phone, probably while doing something
 * else, and its only job is to say an order arrived and whether it is paid.
 * The detail is in the email and the console.
 */
function ownerWhatsApp(input: OrderNotificationInput): string {
  const count = input.items.reduce((sum, i) => sum + i.quantity, 0);
  const payment = input.paid ? 'PAID' : input.paymentProvider === 'cod' ? 'COD' : 'UNPAID';
  const where = input.address?.city ?? 'unknown city';

  return `New order ${input.orderNumber} — ${formatPaise(input.total)} (${payment}). ${count} item${count === 1 ? '' : 's'} to ${where}.`;
}

export type NotificationOutcome = {
  customerEmailed: boolean;
  ownerEmailed: boolean;
  ownerWhatsApped: boolean;
};

/**
 * Sends all three, and never throws.
 *
 * The sends run in parallel: they are independent, and doing them in sequence
 * would add three provider round trips to the checkout response for no reason.
 */
export async function notifyOrderPlaced(
  input: OrderNotificationInput
): Promise<NotificationOutcome> {
  const outcome: NotificationOutcome = {
    customerEmailed: false,
    ownerEmailed: false,
    ownerWhatsApped: false,
  };

  const ownerAddress = process.env.OWNER_EMAIL;

  const tasks: Promise<void>[] = [];

  if (emailDeliveryConfigured()) {
    const customer = customerEmail(input);
    tasks.push(
      sendEmail(input.email, customer.subject, customer.text)
        .then((r) => {
          outcome.customerEmailed = r.ok;
        })
        .catch((err) => reportError(err, { scope: 'orderNotify.customerEmail' }))
    );

    if (ownerAddress) {
      const owner = ownerEmail(input);
      tasks.push(
        sendEmail(ownerAddress, owner.subject, owner.text)
          .then((r) => {
            outcome.ownerEmailed = r.ok;
          })
          .catch((err) => reportError(err, { scope: 'orderNotify.ownerEmail' }))
      );
    }
  }

  if (whatsappConfigured()) {
    tasks.push(
      sendWhatsApp(ownerWhatsApp(input))
        .then((r) => {
          outcome.ownerWhatsApped = r.ok;
        })
        .catch((err) => reportError(err, { scope: 'orderNotify.whatsapp' }))
    );
  }

  await Promise.allSettled(tasks);
  return outcome;
}
