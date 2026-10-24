import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Help' };

/**
 * Plain answers for the stockroom, for days the owner is not around to ask.
 * Written as the jobs people actually do, in the order they do them.
 */
const TOPICS: { title: string; steps: string[]; note?: string }[] = [
  {
    title: 'Sending an order',
    steps: [
      'Open Dispatch. Orders are oldest first: always work from the top.',
      'Pick the items listed under "Pack" and put them in a box.',
      'Press "Mark packed".',
      'Press "Book courier". The tracking number and courier appear on the card.',
      'Press "Print the shipping label", stick it on the box, and keep the box ready for pickup.',
      'That is all. The courier updates the order by itself: shipped, out for delivery, delivered.',
    ],
    note: 'If "Book courier" shows an error (for example a PIN code the courier does not reach), tell the owner. Do not send the parcel another way without asking.',
  },
  {
    title: 'An order says "On hold"',
    steps: [
      'Do not pack it.',
      'The owner has to decide first (a risky cash-on-delivery order, or a payment problem).',
      'It will move by itself once the owner clears it.',
    ],
  },
  {
    title: 'An order says "Not paid. Do not send"',
    steps: [
      'Do not pack it. The customer left the payment page without paying.',
      'It disappears from the list on its own if it is never paid.',
    ],
  },
  {
    title: 'New stock arrived',
    steps: [
      'Open Stock and find the product and size.',
      'In the box next to it, type how many you are putting on the shelf with a plus, for example +24, and press Apply.',
      'Taking some out (damaged, samples)? Type a minus number instead, for example -2, and press Apply.',
    ],
    note: 'Count before you type. The website sells exactly what this screen says you have.',
  },
  {
    title: 'Something is running low',
    steps: [
      'You usually do not need to do anything: every morning the system raises a restock request for anything that will run out within a week, and tells the owner.',
      'If you notice something the system has missed, open Stock, type how many you want under "Need more" on that line, and press Request.',
    ],
  },
  {
    title: 'A parcel came back',
    steps: [
      'Returned parcels are put back into stock automatically when the courier marks them returned.',
      'Open the box and check the items. If anything is damaged, take it off in Stock with a minus number and tell the owner.',
    ],
  },
  {
    title: 'A customer calls about their order',
    steps: [
      'Ask for the order number (it starts with AVY).',
      'Find it on Dispatch. The tracking number on the card opens the courier’s tracking page.',
      'For refunds, cancellations or anything about money, take their number and pass it to the owner.',
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-headline text-3xl font-normal tracking-tight">Help</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Everyday jobs, step by step. If something is not covered here, ask the owner before guessing.
      </p>

      <div className="mt-8 space-y-4">
        {TOPICS.map((topic) => (
          <details key={topic.title} className="group rounded-xl border border-border bg-card p-6 open:pb-6">
            <summary className="cursor-pointer list-none text-[17px] font-medium marker:hidden">{topic.title}</summary>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
              {topic.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {topic.note && (
              <p className="mt-4 rounded-lg bg-muted/60 p-3 text-[14px] leading-relaxed text-muted-foreground">
                {topic.note}
              </p>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
