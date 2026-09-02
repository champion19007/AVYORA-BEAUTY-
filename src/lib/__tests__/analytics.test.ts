import { describe, expect, it } from 'vitest';
import { computeTrend, type DailyPoint } from '@/lib/analytics';

/**
 * The trend calculation.
 *
 * The important cases are the ones where an honest answer is "we cannot tell".
 * A percentage change from a base of zero, and a projection built on two days
 * of data, both look authoritative on a dashboard and are worth nothing — and
 * a shop owner ordering stock against them spends real money.
 */

const day = (date: string, revenue: number): DailyPoint => ({ date, orders: 1, revenue });

describe('computeTrend', () => {
  it('reports growth between the two halves of the window', () => {
    const points = [
      day('2026-06-01', 100),
      day('2026-06-02', 100),
      day('2026-06-03', 200),
      day('2026-06-04', 200),
    ];

    const trend = computeTrend(points);
    expect(trend.priorAverage).toBe(100);
    expect(trend.recentAverage).toBe(200);
    expect(trend.changePercent).toBe(100);
  });

  it('reports a decline as a negative change', () => {
    const points = [day('a', 200), day('b', 200), day('c', 50), day('d', 50)];
    expect(computeTrend(points).changePercent).toBe(-75);
  });

  it('refuses to express growth from nothing as a percentage', () => {
    // "Up infinity per cent" from a zero base is not information.
    const points = [day('a', 0), day('b', 0), day('c', 500), day('d', 500)];

    const trend = computeTrend(points);
    expect(trend.changePercent).toBeNull();
    expect(trend.recentAverage).toBe(500);
  });

  it('projects the next week from the recent rate only', () => {
    // The earlier half is deliberately ignored: the projection follows where
    // things are now, not where they were a month ago.
    const points = [day('a', 0), day('b', 0), day('c', 100), day('d', 100)];
    expect(computeTrend(points).next7Days).toBe(700);
  });

  it('publishes its own sample size', () => {
    const points = Array.from({ length: 30 }, (_, i) => day(`d${i}`, 10));
    expect(computeTrend(points).sampleDays).toBe(15);
  });

  it('does not divide by zero on an empty window', () => {
    const trend = computeTrend([]);
    expect(trend.recentAverage).toBe(0);
    expect(trend.next7Days).toBe(0);
    expect(trend.changePercent).toBeNull();
  });
});
