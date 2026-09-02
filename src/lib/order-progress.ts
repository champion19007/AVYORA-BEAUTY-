/**
 * What the customer is told, and what the shop actually records.
 *
 * These are two different vocabularies and mixing them causes real trouble.
 * Internally an order is `paid`, `fulfilled`, `shipped`; a customer wants to
 * know whether someone has picked it up yet and roughly when it arrives.
 * Showing them `fulfilled` invites a support message asking what that means.
 *
 * The mapping lives here, once, so the storefront and the operations console
 * cannot drift into describing the same order differently.
 */

/** The steps a customer sees, in order. */
export const CUSTOMER_STEPS = [
  'Order placed',
  'Being prepared',
  'On its way',
  'Out for delivery',
  'Delivered',
] as const;

export type CustomerStep = (typeof CUSTOMER_STEPS)[number];

/**
 * Which step an internal status corresponds to.
 *
 * `pending` and `paid` both read as "Order placed": the customer does not care
 * that our payment webhook has or has not landed, only that the order exists.
 * A cash-on-delivery order sits at `pending` its whole life and would otherwise
 * look stuck.
 */
const STEP_BY_STATUS: Record<string, CustomerStep> = {
  pending: 'Order placed',
  paid: 'Order placed',
  fulfilled: 'Being prepared',
  shipped: 'On its way',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};

export type OrderProgress = {
  /** Index into CUSTOMER_STEPS, or -1 when the order is not progressing. */
  currentIndex: number;
  label: string;
  /** True for cancelled and refunded, which leave the track entirely. */
  stopped: boolean;
  /** Plain-language line under the tracker. */
  description: string;
};

const STOPPED: Record<string, { label: string; description: string }> = {
  cancelled: {
    label: 'Cancelled',
    description: 'This order was cancelled. Anything already paid is refunded to the original method.',
  },
  refunded: {
    label: 'Refunded',
    description: 'This order was refunded. It can take 5–7 working days to appear on your statement.',
  },
};

const DESCRIPTIONS: Record<CustomerStep, string> = {
  'Order placed': 'We have your order and will start preparing it shortly.',
  'Being prepared': 'Your order is being packed.',
  'On its way': 'Handed to the courier and travelling to your city.',
  'Out for delivery': 'With the delivery agent today.',
  Delivered: 'Delivered. We hope you enjoy it.',
};

/** Translates an internal status into what the customer should see. */
export function orderProgress(status: string): OrderProgress {
  const stopped = STOPPED[status];
  if (stopped) {
    return { currentIndex: -1, label: stopped.label, stopped: true, description: stopped.description };
  }

  const step = STEP_BY_STATUS[status];
  if (!step) {
    // An unknown status must not render a blank tracker; say the honest thing.
    return {
      currentIndex: 0,
      label: 'Order placed',
      stopped: false,
      description: 'We have your order.',
    };
  }

  return {
    currentIndex: CUSTOMER_STEPS.indexOf(step),
    label: step,
    stopped: false,
    description: DESCRIPTIONS[step],
  };
}
