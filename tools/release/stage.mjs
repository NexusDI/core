/**
 * Stages one package for `nx release publish`: `node tools/release/stage.mjs
 * <projectRoot>`.
 *
 * It packs the package with npm, extracts the tarball into
 * tmp/publish/<projectRoot> and rewrites the extracted package.json with
 * publishManifest (lib.mjs), which drops the `@nexusdi/source` condition and
 * the `./src/` sideEffects the workspace resolves. The nx-release-publish
 * target publishes that directory (nx.json targetDefaults). Extracting npm's
 * own tarball keeps the staged file set equal to what npm would publish from
 * the project root.
 *
 * It fails when stagedProblems finds anything wrong with the staged copy.
 * The staged manifest is made from libs/x/package.json, so the version check
 * has nothing to compare here; scripts/verify-packaging.mjs holds the packed
 * version against the repo's.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { PUBLISH_ROOT, publishManifest, stagedProblems } from './lib.mjs';
import { packageFiles } from './package-files.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const projectRoot = process.argv[2];
if (!projectRoot) {
  console.error('usage: node tools/release/stage.mjs <projectRoot>');
  process.exit(1);
}

const source = join(ROOT, projectRoot);
const target = join(ROOT, PUBLISH_ROOT, projectRoot);
const packDir = mkdtempSync(join(tmpdir(), 'nexusdi-stage-'));

try {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  const [{ filename }] = JSON.parse(
    execFileSync(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', packDir],
      { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    ),
  );
  // Every entry in an npm tarball sits under package/.
  execFileSync(
    'tar',
    ['-xzf', join(packDir, filename), '-C', target, '--strip-components=1'],
    { stdio: 'inherit' },
  );

  const manifest = publishManifest(
    JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')),
  );
  writeFileSync(
    join(target, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const problems = stagedProblems({
    manifest,
    files: packageFiles(target),
    read: (path) => readFileSync(join(target, path), 'utf8'),
  });
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Staged ${manifest.name} in ${relative(ROOT, target)}`);
  }
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
