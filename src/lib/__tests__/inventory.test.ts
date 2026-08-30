import { describe, it, expect } from 'vitest';
import { stockLabel } from '../inventory';

/**
 * `reserveStock` is deliberately not unit-tested with a fake database: its
 * whole correctness argument is that the decrement happens in one conditional
 * UPDATE, and a mock would test the mock rather than the SQL. It needs an
 * integration test against a real Postgres, which is noted in docs/scaling.md.
 *
 * The pure display logic is tested here.
 */
describe('stockLabel', () => {
  it('reports out of stock at zero and below', () => {
    expect(stockLabel(0).tone).toBe('out');
    expect(stockLabel(-3).tone).toBe('out');
    expect(stockLabel(0).label).toBe('Out of stock');
  });

  it('warns when stock is at or under the threshold', () => {
    expect(stockLabel(5, 5)).toEqual({ label: 'Only 5 left', tone: 'low' });
    expect(stockLabel(1, 5).tone).toBe('low');
  });

  it('reports plain availability above the threshold', () => {
    expect(stockLabel(6, 5)).toEqual({ label: 'In stock', tone: 'in' });
    expect(stockLabel(500).tone).toBe('in');
  });

  it('treats unknown and unlimited stock as available', () => {
    // A SKU with no inventory row is not stock-managed, so it must not read as
    // sold out — that would take the whole catalogue offline the moment
    // inventory is introduced.
    expect(stockLabel(undefined).tone).toBe('in');
    expect(stockLabel(Infinity).tone).toBe('in');
  });

  it('respects a custom threshold', () => {
    expect(stockLabel(8, 10).tone).toBe('low');
    expect(stockLabel(8, 3).tone).toBe('in');
  });
});
