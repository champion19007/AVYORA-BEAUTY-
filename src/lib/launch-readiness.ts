import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findContentProblems, stripComments, type ContentProblem } from '@/lib/content-claims';
import { UNCONFIRMED_BUSINESS_DETAILS } from '@/data/business-info';
import { APPROVED_DIRECTIONS, TREATMENTS } from '@/data/product-directions';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import { knowledgeProblems, treatmentReadiness } from '@/modules/ingredients/formulations';

/**
 * What still stands between this storefront and launch. Node-only (reads the
 * source tree); used by `npm run check:launch` and its test.
 */

/** Customer-facing source. Staff tools, API routes and tests are not scanned. */
const STOREFRONT_DIRS = ['src/app', 'src/components', 'src/data'];
const SKIP = /(?:^|[\\/])(?:__tests__|admin|admin-login|manager|api)(?:[\\/]|$)/;

export function storefrontSources(root: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full);
      if (SKIP.test(rel)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name))
        out.push({ file: rel.replace(/\\/g, '/'), text: stripComments(readFileSync(full, 'utf8')) });
    }
  };
  for (const d of STOREFRONT_DIRS) walk(join(root, d));
  return out;
}

export function storefrontProblems(root: string): (ContentProblem & { file: string })[] {
  return storefrontSources(root).flatMap(({ file, text }) => findContentProblems(text).map((p) => ({ ...p, file })));
}

export function launchBlockers(root: string): string[] {
  const blockers: string[] = [];

  const byFile = new Map<string, number>();
  for (const p of storefrontProblems(root)) {
    if (p.kind === 'placeholder') byFile.set(p.file, (byFile.get(p.file) ?? 0) + 1);
    else blockers.push(`${p.file}: "${p.match}" (${p.why})`);
  }
  for (const [file, n] of byFile) blockers.push(`${file}: ${n} unconfirmed placeholder${n === 1 ? '' : 's'}`);

  for (const d of UNCONFIRMED_BUSINESS_DETAILS) blockers.push(`Confirm: ${d}`);

  const knowledge = { formulations: FORMULATIONS, evidence: EVIDENCE_SOURCES, directions: APPROVED_DIRECTIONS };
  for (const p of knowledgeProblems(knowledge)) blockers.push(`Knowledge: ${p}`);
  const notReady = Object.entries(TREATMENTS).flatMap(([id, t]) => {
    const r = treatmentReadiness(id, t.class, knowledge);
    return r.ready
      ? []
      : [`${id} (${r.reason === 'directions_pending' ? 'no approved directions' : 'formulation incomplete'})`];
  });
  if (notReady.length) blockers.push(`Treatments not ready to recommend: ${notReady.join(', ')}`);

  return blockers;
}
