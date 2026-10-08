/**
 * The desktop redesign (Nuvē reference) is behind a build-time flag so the
 * rollout can be reviewed and reverted by changing one environment variable:
 *
 *   NEXT_PUBLIC_REDESIGN=1   new shell and primitives
 *   unset                    the current storefront, unchanged
 *
 * Build-time on purpose: a per-request switch (cookie or header) would make
 * every public page dynamic and uncacheable. Each deployment is one design.
 * Preview deployments can set it to review the redesign before production.
 */
export const REDESIGN = process.env.NEXT_PUBLIC_REDESIGN === '1';
