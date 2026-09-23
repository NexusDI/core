// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256File, verifyChecksum } from './snapshot-assets.mjs';

const file = join(
  mkdtempSync(join(tmpdir(), 'snapshot-assets-')),
  'nexusdi-docs-0.3-root-r1.tar.gz',
);
writeFileSync(file, 'archive bytes');
const digest =
  '4b6c4ef0b3f5b2e2b0c1d7b51b4a5e5f3b1ef43f4bc2d1b4f7d0fbc0ea1e5d8b';

describe('snapshot assets', () => {
  it('hashes a file', () => {
    expect(sha256File(file)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts the recorded checksum', () => {
    expect(() => verifyChecksum(file, sha256File(file))).not.toThrow();
  });

  it('names the asset when the checksum differs', () => {
    expect(() => verifyChecksum(file, digest)).toThrow(
      `nexusdi-docs-0.3-root-r1.tar.gz: sha256 is ${sha256File(file)}, and deploy.json records ${digest}. The deploy stops before unpacking it.`,
    );
  });

  it('names the asset when the file is missing', () => {
    expect(() => verifyChecksum(`${file}.missing`, digest)).toThrow(
      'nexusdi-docs-0.3-root-r1.tar.gz.missing: the release asset was not downloaded.',
    );
  });
});
