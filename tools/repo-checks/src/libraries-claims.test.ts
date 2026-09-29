import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  claimFaults,
  headerOf,
  type ClaimedLibrary,
} from './libraries-claims.js';

describe('libraries-claims', () => {
  it('flags a claim verified against an older pin', () => {
    expect(
      claimFaults(
        [
          {
            id: 'awilix',
            version: '13.0.5',
            docs: 'u',
            claims: [{ source: 's', verifiedAgainst: '12.0.0' }],
          },
        ],
        new Map(),
      ),
    ).toEqual(['awilix claim 0 verified against 12.0.0, pinned 13.0.5']);
  });

  it('flags a claim without a source', () => {
    expect(
      claimFaults(
        [
          {
            id: 'awilix',
            version: '13.0.5',
            docs: 'u',
            claims: [{ verifiedAgainst: '13.0.5' }],
          },
        ],
        new Map(),
      ),
    ).toEqual(['awilix claim 0 has no source']);
  });

  it('flags a fixture header without the pinned version', () => {
    expect(
      claimFaults(
        [{ id: 'awilix', version: '13.0.5', docs: 'u', claims: [] }],
        new Map([['awilix/plain.ts', '// Docs: u (13.0.4)']]),
      ),
    ).toEqual(['awilix/plain.ts does not name version 13.0.5']);
  });

  it('flags a fixture header without the docs URL', () => {
    expect(
      claimFaults(
        [{ id: 'awilix', version: '13.0.5', docs: 'u', claims: [] }],
        new Map([['awilix/plain.ts', '// Docs: elsewhere (13.0.5)']]),
      ),
    ).toEqual(['awilix/plain.ts does not cite u']);
  });

  it('holds the repository', () => {
    const root = join(workspaceRoot, 'benchmarks', 'fixtures');
    const { libraries } = JSON.parse(
      readFileSync(join(workspaceRoot, 'benchmarks', 'libraries.json'), 'utf8'),
    ) as { libraries: ClaimedLibrary[] };
    const headers = new Map<string, string>();
    for (const e of readdirSync(root, { recursive: true, withFileTypes: true }))
      if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
        const path = join(e.parentPath, e.name);
        headers.set(
          relative(root, path).replace(/^probes\//, ''),
          headerOf(readFileSync(path, 'utf8')),
        );
      }
    expect(claimFaults(libraries, headers)).toEqual([]);
  });
});
