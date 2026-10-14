import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { newestTag, readCoreRef, writeCoreRef } from './release-core.ts';

describe('the core-ref file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'core-ref-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'nested', 'core-ref');

  it('is absent before release-core.ts has run', () => {
    expect(readCoreRef(file)).toBeUndefined();
  });
  it('round-trips the tag release-core.ts restored', () => {
    writeCoreRef('@nexusdi/core@0.4.0-rc.1', file);
    expect(readCoreRef(file)).toBe('@nexusdi/core@0.4.0-rc.1');
  });
  it('round-trips workspace and replaces the earlier ref', () => {
    writeCoreRef('workspace', file);
    expect(readCoreRef(file)).toBe('workspace');
  });
});

describe('newestTag', () => {
  it('ignores releases before the 0.4 API', () => {
    expect(newestTag(['@nexusdi/core@0.3.2', '@nexusdi/core@0.2.0'])).toBe(
      null,
    );
  });
  it('picks the newest release at or above 0.4.0', () => {
    expect(
      newestTag([
        '@nexusdi/core@0.3.2',
        '@nexusdi/core@0.4.0-rc.1',
        '@nexusdi/core@0.4.0',
        '@nexusdi/core@0.4.1',
        '@nexusdi/devtools@0.9.0',
      ]),
    ).toBe('@nexusdi/core@0.4.1');
  });
  it('picks rc.10 over rc.9', () => {
    expect(
      newestTag(['@nexusdi/core@0.4.0-rc.9', '@nexusdi/core@0.4.0-rc.10']),
    ).toBe('@nexusdi/core@0.4.0-rc.10');
  });
});
