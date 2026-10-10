/**
 * Previews a batch of product records before onboarding. Writes nothing.
 *
 *   npm run catalogue:validate -- <products.json> [--evidence <evidence.json>]
 *
 * Evidence sources are those in src/data/formulations.ts plus any in the
 * optional evidence file. Exits 1 when any record is not publishable.
 */
import { readFileSync } from 'node:fs';
import { EVIDENCE_SOURCES, FORMULATIONS } from '../src/data/formulations';
import { PRODUCTS } from '../src/data/mock-data';
import { previewOnboarding } from '../src/modules/catalog/onboarding';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--evidence');
const evidenceFile = args[args.indexOf('--evidence') + 1];
if (!file) {
  console.error('usage: npm run catalogue:validate -- <products.json> [--evidence <evidence.json>]');
  process.exit(2);
}
const extra = args.includes('--evidence') && evidenceFile ? JSON.parse(readFileSync(evidenceFile, 'utf8')) : [];
const existing = [...new Set([...PRODUCTS.map((p) => p.id), ...FORMULATIONS.map((f) => f.productId)])];
const preview = previewOnboarding(JSON.parse(readFileSync(file, 'utf8')), [...EVIDENCE_SOURCES, ...extra], existing);

for (const p of preview.problems) console.log(`BATCH  ${p}`);
for (const r of preview.records) {
  const state = !r.publishable ? 'BLOCKED' : r.recommendable ? 'READY' : 'PUBLISHABLE (not recommendable)';
  console.log(`\n${state}  ${r.id}`);
  for (const p of r.problems) console.log(`  problem     ${p}`);
  for (const u of r.unresolved) console.log(`  unresolved  ${u}`);
}
console.log(
  `\n${preview.records.filter((r) => r.publishable).length}/${preview.records.length} publishable, ${preview.records.filter((r) => r.recommendable).length} recommendable.`
);
process.exitCode = preview.ok ? 0 : 1;
