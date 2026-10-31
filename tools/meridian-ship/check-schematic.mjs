// Regenerates the schematic cutaway into a temp directory and compares it with
// the committed file. It never skips: a machine without python3 fails.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const committed = join(
  root,
  'apps/docs/components/front-page/meridian-schematic.svg',
);
const regenerate =
  'python3 -I tools/meridian-ship/ship_svg.py --schematic --out <dir>';
const refresh =
  'python3 -I tools/meridian-ship/ship_svg.py --schematic --out apps/docs/components/front-page';

const out = mkdtempSync(join(tmpdir(), 'meridian-schematic-'));
try {
  const run = spawnSync(
    'python3',
    ['-I', 'tools/meridian-ship/ship_svg.py', '--schematic', '--out', out],
    { cwd: root, encoding: 'utf8' },
  );
  if (run.error) {
    const missing = run.error.code === 'ENOENT';
    console.error(
      missing
        ? 'check-schematic: python3 is not on PATH. The drift check needs Python 3 and does not skip. Install it and rerun.'
        : `check-schematic: could not run python3: ${run.error.message}`,
    );
    process.exit(1);
  }
  if (run.status !== 0) {
    console.error(`check-schematic: \`${regenerate}\` failed.\n${run.stderr}`);
    process.exit(1);
  }
  const fresh = readFileSync(join(out, 'meridian-schematic.svg'), 'utf8');
  const have = readFileSync(committed, 'utf8');
  if (fresh !== have) {
    console.error(
      `check-schematic: apps/docs/components/front-page/meridian-schematic.svg differs from the geometry.\nRegenerate it and commit the result:\n  ${refresh}`,
    );
    process.exit(1);
  }
  console.log('check-schematic: the committed cutaway matches the geometry.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
