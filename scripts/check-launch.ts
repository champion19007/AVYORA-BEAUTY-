/**
 * Lists everything that keeps the storefront from being launch-ready:
 * unconfirmed business details, unsupported offers or claims, and treatments
 * without approved directions. Exits 1 while anything remains.
 *
 * Not part of CI: unfinished business content is expected during development.
 * Run it before calling a release launch-ready.
 */
import { launchBlockers } from '../src/lib/launch-readiness';

const blockers = launchBlockers(process.cwd());
if (blockers.length === 0) {
  console.log('Launch check: nothing outstanding.');
} else {
  console.log(`Launch check: ${blockers.length} item(s) outstanding\n`);
  for (const b of blockers) console.log(`  - ${b}`);
  process.exitCode = 1;
}
