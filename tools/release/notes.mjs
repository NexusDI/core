/**
 * Prints the release notes of one version from libs/core/CHANGELOG.md, for a
 * resume that has to create the GitHub release nx did not (release spec
 * section 5.8 step 2).
 *
 *   node tools/release/notes.mjs <version>
 */
import { readFileSync } from 'node:fs';

import { changelogSection } from './lib.mjs';

const version = process.argv[2] ?? '';
const section = changelogSection(
  readFileSync('libs/core/CHANGELOG.md', 'utf8'),
  version,
);
if (section === null) {
  console.error(`libs/core/CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}
process.stdout.write(`${section}\n`);
