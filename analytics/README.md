# Analytics data platform

Downstream of the application, never in its request path.

```
Postgres (truth) ──outbox──▶ domain_events
                               │
            ┌──────────────────┼──────────────────────┐
            ▼                                         ▼
  analytics.export job                       stream-relay consumer
  (daily, via the job queue)                 (only if KAFKA_* is set)
            │                                         │
            ▼                                         ▼
  object storage landing zone                Kafka topics avyora.<aggregate>
  landing/domain_events/dt=…/part-….ndjson            │
            │                                         ▼
            ▼                                  stream consumers (none yet)
  Spark / Hadoop-family jobs  ──▶  curated/… (Parquet)
```

| Piece | Status |
| --- | --- |
| Landing-zone export (`src/modules/analytics/landing-zone.ts`) | Implemented, tested; needs `STORAGE_ANALYTICS_BUCKET` in production |
| Event envelope, PII redaction (`envelope.ts`) | Implemented, tested |
| Kafka relay (`stream-relay.ts`, `KafkaRestProducer`) | Partially implemented: request format tested against a fake; never run against a real cluster |
| `spark/daily_order_metrics.py` | Reference job, not yet executed |
| Hadoop/HDFS | Not used. The landing zone is S3-compatible object storage, which Spark and Hive read directly (`s3a://`); HDFS adds nothing until there is a cluster to run it on |

Guarantees a downstream job can rely on:

- Every file is NDJSON, one event per line, `schema_version` on every row.
- Delivery is at-least-once. Deduplicate on `event_id`.
- Events appear in the landing zone about five minutes after they happen at
  the earliest (a safety lag), and within a day at the latest (the export's
  schedule on the free hosting plan).
- Payloads are redacted with the same rules as application logs.
