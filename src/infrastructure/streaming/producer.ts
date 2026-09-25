/**
 * Publishing events to a stream (Kafka, or anything with the same shape).
 *
 * The stream sits downstream of the transactional outbox, never in front of
 * the database: an order is committed to Postgres first, the event row
 * commits with it, and only then does a relay copy the event out. So a
 * broker outage delays analytics and never touches checkout — the relay
 * retries with the outbox's backoff until the broker is back.
 *
 * Relayed events are at-least-once. A consumer must dedupe on `event_id`
 * (it is in every record's key headers and body).
 */

export type StreamRecord = {
  topic: string;
  /** Partition key: events about one order stay in order relative to each other. */
  key: string;
  value: unknown;
  headers?: Record<string, string>;
};

export interface EventStreamProducer {
  readonly kind: string;
  send(record: StreamRecord): Promise<void>;
}

/** Keeps records in memory. For tests. */
export class MemoryProducer implements EventStreamProducer {
  readonly kind = 'memory';
  readonly records: StreamRecord[] = [];
  async send(record: StreamRecord): Promise<void> {
    this.records.push(record);
  }
}

/**
 * Kafka through the Confluent REST Proxy v3 API
 * (`POST /v3/clusters/{cluster}/topics/{topic}/records`), which Confluent
 * Cloud and self-hosted REST Proxy both serve.
 *
 * HTTP rather than the Kafka wire protocol because this runs in serverless
 * functions: a native Kafka client wants a long-lived process holding TCP
 * connections to every broker, and a function lives for one request.
 *
 * Written against the published API, not yet run against a real cluster.
 */
export class KafkaRestProducer implements EventStreamProducer {
  readonly kind = 'kafka-rest';

  constructor(
    private readonly config: { baseUrl: string; clusterId: string; apiKey: string; apiSecret: string },
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(record: StreamRecord): Promise<void> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/kafka/v3/clusters/${encodeURIComponent(
      this.config.clusterId
    )}/topics/${encodeURIComponent(record.topic)}/records`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        key: { type: 'STRING', data: record.key },
        value: { type: 'JSON', data: record.value },
        headers: Object.entries(record.headers ?? {}).map(([name, value]) => ({
          name,
          value: Buffer.from(value).toString('base64'),
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Kafka REST produce failed: ${res.status}`);
    // The proxy can answer 200 with a per-record error inside.
    const body = (await res.json().catch(() => null)) as { error_code?: number; message?: string } | null;
    if (body?.error_code && body.error_code >= 400) {
      throw new Error(`Kafka REST produce rejected: ${body.error_code} ${body.message ?? ''}`.trim());
    }
  }
}

let resolved: EventStreamProducer | null | undefined;

/** The configured producer, or null: no stream is set up, and nothing is relayed. */
export function eventStreamProducer(): EventStreamProducer | null {
  if (resolved !== undefined) return resolved;
  const env = process.env;
  resolved =
    env.KAFKA_REST_URL && env.KAFKA_CLUSTER_ID && env.KAFKA_API_KEY && env.KAFKA_API_SECRET
      ? new KafkaRestProducer({
          baseUrl: env.KAFKA_REST_URL,
          clusterId: env.KAFKA_CLUSTER_ID,
          apiKey: env.KAFKA_API_KEY,
          apiSecret: env.KAFKA_API_SECRET,
        })
      : null;
  return resolved;
}

export function setEventStreamProducer(producer: EventStreamProducer | null | undefined): void {
  resolved = producer;
}

export function topicFor(eventName: string): string {
  const prefix = process.env.KAFKA_TOPIC_PREFIX || 'avyora';
  // One topic per aggregate, not per event: `avyora.order` carries placed,
  // paid, cancelled… so a consumer sees an order's events in order.
  return `${prefix}.${eventName.split('.')[0]}`;
}
