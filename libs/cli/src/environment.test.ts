import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from '../test-support/run.js';
import { tempDir } from '../test-support/temp.js';
import { environmentOf } from './profile.js';

describe('environmentOf', () => {
  it('names this Node and the core the entry resolves', () => {
    const core = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@nexusdi/core/package.json')),
        'utf8',
      ),
    ) as { version: string };
    expect(
      environmentOf(join(FIXTURES, 'profile', 'meridian.module.js')),
    ).toEqual({
      node: process.versions.node,
      core: core.version,
    });
  });

  it('says the core is unresolved for an entry no @nexusdi/core reaches', () => {
    expect(environmentOf(join(tempDir(), 'entry.js')).core).toBe(
      '(unresolved)',
    );
  });
});
