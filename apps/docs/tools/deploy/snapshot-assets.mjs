import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Stops the deploy before an archive is unpacked when its bytes differ from
 * what deploy.json records (spec §15.2).
 */
export function verifyChecksum(file, expected) {
  const name = basename(file);
  if (!existsSync(file))
    throw new Error(`${name}: the release asset was not downloaded.`);
  const actual = sha256File(file);
  if (actual !== expected) {
    throw new Error(
      `${name}: sha256 is ${actual}, and deploy.json records ${expected}. The deploy stops before unpacking it.`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, file, expected] = process.argv.slice(2);
  if (command !== 'verify')
    throw new Error('usage: snapshot-assets.mjs verify <file> <sha256>');
  verifyChecksum(file, expected);
  console.log(`${basename(file)}: checksum matches`);
}
