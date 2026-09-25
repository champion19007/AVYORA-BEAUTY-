/**
 * Request identifiers — the edge-safe half.
 *
 * Imported by middleware, so this file must not touch anything Node-only: no
 * `node:` modules, no database. It only mints and validates the id. Carrying it
 * through the rest of a request is `request-context.ts`, which runs in Node.
 *
 * One id follows a request everywhere it goes: the response header, every log
 * line, the domain events it emits, the audit rows it writes, the jobs it
 * queues. Given `req_…` from a customer's screenshot, every consequence of that
 * click can be found.
 */

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * What an inbound id may look like.
 *
 * An upstream proxy or load balancer may already have assigned one, and
 * keeping it lets our logs join theirs. But the value ends up in logs and in
 * the database, so anything outside this shape — too long, or carrying
 * characters that could forge a log line — is replaced rather than trusted.
 */
const ACCEPTABLE = /^[A-Za-z0-9._:-]{8,128}$/;

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Keeps a well-formed inbound id, mints a fresh one otherwise. */
export function normaliseRequestId(inbound: string | null | undefined): string {
  return inbound && ACCEPTABLE.test(inbound) ? inbound : newRequestId();
}
