/**
 * DEMONSTRATION FIXTURES for the /design-system review page only.
 *
 * Placeholder copy to exercise the components (long text, errors, empty
 * states). Not product claims, not policy and not shown anywhere else;
 * production pages take their content from the catalogue, the knowledge
 * release and the business-info module.
 */
export const DEMO_FAQ = [
  { id: 'one', question: 'DEMO: How is a routine built?', answer: 'DEMO answer. Real FAQ content comes from approved copy in a later prompt.' },
  { id: 'two', question: 'DEMO: A much longer question that wraps onto a second line to check that the toggle stays aligned with the first line of text?', answer: 'DEMO answer with several sentences. '.repeat(6) },
  { id: 'three', question: 'DEMO: Is this item closed by default?', answer: 'DEMO answer.' },
];

export const DEMO_LONG_TITLE = 'DEMO: An unusually long product name that keeps going to test wrapping inside a card title';

/** A deliberately missing image (valid host, nonexistent photo) to show the failure state. */
export const DEMO_BROKEN_IMAGE = 'https://images.unsplash.com/photo-0000000000000-000000000000?w=800';
