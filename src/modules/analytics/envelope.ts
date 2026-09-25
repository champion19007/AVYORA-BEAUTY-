import { redact } from '@/lib/observability';

/**
 * The shape a domain event takes when it leaves the application — for the
 * analytics landing zone and for an event stream.
 *
 * One definition for both, so a Spark job reading the lake and a stream
 * consumer reading Kafka see the same fields with the same names.
 *
 * Payloads pass through the same redaction as logs. Events today carry ids,
 * not personal data, and redaction keeps it that way if someone later adds
 * an email to a payload: data platforms are copied, retained and queried by
 * more people than the database is.
 */

export const ENVELOPE_VERSION = 1;

export type EventEnvelope = {
  schema_version: number;
  event_id: number;
  name: string;
  subject: string | null;
  request_id: string | null;
  occurred_at: string;
  payload: unknown;
};

export function toEnvelope(event: {
  id: number;
  name: string;
  subject: string | null;
  requestId: string | null;
  createdAt: Date | string;
  payload: unknown;
}): EventEnvelope {
  return {
    schema_version: ENVELOPE_VERSION,
    event_id: event.id,
    name: event.name,
    subject: event.subject,
    request_id: event.requestId,
    occurred_at: new Date(event.createdAt).toISOString(),
    payload: redact(event.payload ?? {}),
  };
}
