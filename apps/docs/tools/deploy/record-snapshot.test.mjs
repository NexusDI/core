// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { validateDeployConfig } from './deploy-config.mjs';
import { recordSnapshot } from './record-snapshot.mjs';

const config = () => ({
  mode: 'snapshot-only',
  root: { tag: null, sha: null, reason: null },
  snapshot: {
    release: 'docs-snapshot-0.3',
    source: '6d5e4f3',
    revision: 0,
    assets: null,
  },
  finalDate: null,
});

describe('recordSnapshot', () => {
  it('writes the revision, the names and the checksums', () => {
    const next = recordSnapshot(config(), {
      revision: 1,
      rootSha256: 'a'.repeat(64),
      archiveSha256: 'b'.repeat(64),
    });
    expect(next.snapshot).toEqual({
      release: 'docs-snapshot-0.3',
      source: '6d5e4f3',
      revision: 1,
      assets: {
        root: {
          name: 'nexusdi-docs-0.3-root-r1.tar.gz',
          sha256: 'a'.repeat(64),
        },
        archive: {
          name: 'nexusdi-docs-0.3-archive-r1.tar.gz',
          sha256: 'b'.repeat(64),
        },
      },
    });
    expect(validateDeployConfig(next)).toEqual([]);
  });

  it('refuses a revision that does not move forward', () => {
    const current = recordSnapshot(config(), {
      revision: 2,
      rootSha256: 'a'.repeat(64),
      archiveSha256: 'b'.repeat(64),
    });
    expect(() =>
      recordSnapshot(current, {
        revision: 2,
        rootSha256: 'c'.repeat(64),
        archiveSha256: 'd'.repeat(64),
      }),
    ).toThrow('revision 2 is not after the recorded revision 2');
  });
});
