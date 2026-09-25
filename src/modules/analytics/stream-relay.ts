import type { DomainEvent } from '@/lib/events';
import type { EventStreamProducer } from '@/infrastructure/streaming/producer';
import { topicFor } from '@/infrastructure/streaming/producer';
import { toEnvelope } from './envelope';

/**
 * An outbox consumer that copies each event to the stream.
 *
 * Runs like any other consumer: per-event delivery rows, retries with
 * backoff, dead after five failures and replayable from the console. So a
 * broker outage leaves a queue of undelivered rows, not lost events.
 */
export function streamRelay(producer: EventStreamProducer) {
  return async (event: DomainEvent): Promise<void> => {
    const envelope = toEnvelope(event);
    await producer.send({
      topic: topicFor(event.name),
      key: event.subject ?? String(event.id),
      value: envelope,
      headers: { event_id: String(event.id), event_name: event.name },
    });
  };
}
