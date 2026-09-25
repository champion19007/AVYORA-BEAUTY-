"""
Daily order metrics from the Avyora event landing zone.

STATUS: reference job. Written against the landing-zone layout the
application produces (src/modules/analytics/landing-zone.ts) but NOT yet run
against real data or a real cluster. Nothing in the application depends on
it. Run it when there is a Spark environment worth running it in.

Input (NDJSON, Hive-style day partitions):
    <bucket>/landing/domain_events/dt=YYYY-MM-DD/part-<first_event_id>.ndjson
    one object per line:
        schema_version, event_id, name, subject, request_id, occurred_at, payload

Output (Parquet, partitioned by day):
    <bucket>/curated/daily_order_metrics/dt=YYYY-MM-DD/

Delivery into the landing zone is at-least-once, so the first step is always
to deduplicate on event_id.

Usage:
    spark-submit daily_order_metrics.py s3a://avyora-analytics 2026-09-25
"""

import sys

from pyspark.sql import SparkSession
from pyspark.sql import functions as F


def main(bucket: str, day: str) -> None:
    spark = SparkSession.builder.appName("avyora-daily-order-metrics").getOrCreate()

    events = (
        spark.read.json(f"{bucket}/landing/domain_events/")  # dt is discovered as a partition column
        .where(F.col("dt") == day)
        .where(F.col("schema_version") == 1)
        # At-least-once in, exactly-once out.
        .dropDuplicates(["event_id"])
    )

    orders = events.where(F.col("name").startswith("order.")).select(
        F.col("subject").alias("order_id"),
        F.col("name"),
        F.to_timestamp("occurred_at").alias("occurred_at"),
    )

    # One row per order with the furthest state it reached that day.
    per_order = orders.groupBy("order_id").agg(
        F.max(F.when(F.col("name") == "order.placed", 1).otherwise(0)).alias("placed"),
        F.max(F.when(F.col("name") == "order.paid", 1).otherwise(0)).alias("paid"),
        F.max(F.when(F.col("name") == "order.cancelled", 1).otherwise(0)).alias("cancelled"),
        F.max(F.when(F.col("name") == "order.payment_failed", 1).otherwise(0)).alias("payment_failed"),
    )

    metrics = per_order.agg(
        F.sum("placed").alias("orders_placed"),
        F.sum("paid").alias("orders_paid"),
        F.sum("cancelled").alias("orders_cancelled"),
        F.sum("payment_failed").alias("payment_failures"),
    ).withColumn(
        "paid_rate",
        F.when(F.col("orders_placed") > 0, F.col("orders_paid") / F.col("orders_placed")),
    ).withColumn("dt", F.lit(day))

    (
        metrics.write.mode("overwrite")  # re-running a day replaces it: idempotent
        .partitionBy("dt")
        .parquet(f"{bucket}/curated/daily_order_metrics/")
    )

    spark.stop()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: daily_order_metrics.py <bucket-uri> <YYYY-MM-DD>")
    main(sys.argv[1], sys.argv[2])
