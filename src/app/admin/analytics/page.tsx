import type { Metadata } from 'next';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { isDatabaseConfigured } from '@/db';
import { computeTrend, dailySales, productSales } from '@/lib/analytics';
import { formatPaise } from '@/lib/money';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

/**
 * What sold, which way it is going, and what to reorder.
 *
 * The forecast is a moving average and says so. With a few weeks of orders,
 * anything more elaborate produces a confident line drawn through noise, and
 * stock bought against it is real money spent on a guess. The sample size is
 * printed beside the projection for the same reason.
 */
export default async function AdminAnalyticsPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const [sales, daily] = await Promise.all([productSales(30), dailySales(30)]);
  const trend = computeTrend(daily);
  const totalUnits = sales.reduce((sum, s) => sum + s.unitsSold, 0);

  const TrendIcon =
    trend.changePercent === null
      ? Minus
      : trend.changePercent >= 0
        ? TrendingUp
        : TrendingDown;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-headline text-3xl font-normal tracking-tight">Analytics</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Last 30 days. Cancelled and refunded orders are excluded.
        </p>
      </div>

      {totalUnits === 0 ? (
        <p className="rounded-xl border border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          No sales in the last 30 days, so there is nothing to analyse yet.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Units sold
              </p>
              <p className="mt-3 font-headline text-3xl font-normal tabular-nums">{totalUnits}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Daily average
              </p>
              <p className="mt-3 font-headline text-3xl font-normal tabular-nums">
                {formatPaise(Math.round(trend.recentAverage))}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <TrendIcon className="h-4 w-4" aria-hidden="true" />
                {trend.changePercent === null
                  ? 'No earlier sales to compare'
                  : `${trend.changePercent >= 0 ? '+' : ''}${trend.changePercent.toFixed(0)}% vs the previous fortnight`}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Next 7 days
              </p>
              <p className="mt-3 font-headline text-3xl font-normal tabular-nums">
                {formatPaise(trend.next7Days)}
              </p>
              {/* The honest caveat, next to the number rather than in a footnote. */}
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Straight-line estimate from the last {trend.sampleDays} days. Not a model.
              </p>
            </div>
          </div>

          <section>
            <h2 className="font-headline text-xl font-normal tracking-tight">By product</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Ordered by units, since that is what drives reordering.
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[760px] text-left text-[15px]">
                <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="p-4 font-semibold">Product</th>
                    <th className="p-4 font-semibold">Size</th>
                    <th className="p-4 font-semibold">Units</th>
                    <th className="p-4 font-semibold">Revenue</th>
                    <th className="p-4 font-semibold">On shelf</th>
                    <th className="p-4 font-semibold">Cover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sales.map((row) => {
                    const urgent = row.daysOfCover !== null && row.daysOfCover <= 14;

                    return (
                      <tr
                        key={`${row.productId}-${row.size}`}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <td className="p-4">{row.productName}</td>
                        <td className="p-4 text-muted-foreground">{row.size}</td>
                        <td className="p-4 tabular-nums">{row.unitsSold}</td>
                        <td className="p-4 tabular-nums">{formatPaise(row.revenue)}</td>
                        <td className="p-4 tabular-nums">
                          {row.stockOnHand === null ? '—' : row.stockOnHand}
                        </td>
                        <td className="p-4">
                          {row.daysOfCover === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                urgent
                                  ? 'font-medium text-amber-600 dark:text-amber-400'
                                  : 'tabular-nums'
                              }
                            >
                              ~{row.daysOfCover} days
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Cover is stock on hand divided by the recent daily rate. It assumes demand holds
              steady, which it will not over a festival or a launch — treat it as a prompt to
              look, not an instruction to buy.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
