// Regenerates the schematic cutaway and the cutaway layers into temp
// directories and compares them with the committed files. It never skips: a
// machine without python3 fails.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const schematicDir = 'apps/docs/components/front-page';
const layersDir = 'apps/docs/components/ship-art/cutaway';
const script = 'tools/meridian-ship/ship_svg.py';

/** The pixels of a PNG: the IHDR, then the inflated IDAT data. Byte-exact zlib output can differ between zlib builds, so the check compares what the file decodes to. */
function decodePng(bytes) {
  const parts = [];
  let header = '';
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const kind = bytes.toString('latin1', at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') header = data.toString('hex');
    if (kind === 'IDAT') parts.push(data);
    at += 12 + length;
  }
  return `${header}:${inflateSync(Buffer.concat(parts)).toString('hex')}`;
}

const layers = [
  ['meridian-cutaway-rooms.png', decodePng],
  ['meridian-cutaway-rooms.legend.json', (bytes) => bytes.toString('utf8')],
  ['meridian-cutaway-emissive.png', decodePng],
  ['meridian-cutaway-lights.json', (bytes) => bytes.toString('utf8')],
];

function generate(args, label, command) {
  const run = spawnSync('python3', ['-I', script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
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
    console.error(
      `check-schematic: \`${command}\` failed (${label}).\n${run.stderr}`,
    );
    process.exit(1);
  }
}

const schematicOut = mkdtempSync(join(tmpdir(), 'meridian-schematic-'));
const layersOut = mkdtempSync(join(tmpdir(), 'meridian-layers-'));
try {
  generate(
    ['--schematic', '--out', schematicOut],
    'schematic',
    `python3 -I ${script} --schematic --out <dir>`,
  );
  const fresh = readFileSync(
    join(schematicOut, 'meridian-schematic.svg'),
    'utf8',
  );
  const have = readFileSync(
    join(root, schematicDir, 'meridian-schematic.svg'),
    'utf8',
  );
  if (fresh !== have) {
    console.error(
      `check-schematic: ${schematicDir}/meridian-schematic.svg differs from the geometry.\nRegenerate it and commit the result:\n  python3 -I ${script} --schematic --out ${schematicDir}`,
    );
    process.exit(1);
  }

  generate(
    ['--cutaway-layers', layersOut],
    'cutaway layers',
    `python3 -I ${script} --cutaway-layers <dir>`,
  );
  for (const [name, read] of layers) {
    if (
      read(readFileSync(join(layersOut, name))) !==
      read(readFileSync(join(root, layersDir, name)))
    ) {
      console.error(
        `check-schematic: ${layersDir}/${name} differs from the geometry.\nRegenerate the layers and commit the result:\n  python3 -I ${script} --cutaway-layers ${layersDir}`,
      );
      process.exit(1);
    }
  }
  console.log(
    'check-schematic: the committed cutaway and its layers match the geometry.',
  );
} finally {
  rmSync(schematicOut, { recursive: true, force: true });
  rmSync(layersOut, { recursive: true, force: true });
}
