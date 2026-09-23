// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { MODES, outputsFor, validateDeployConfig } from './deploy-config.mjs';

const assets = (revision) => ({
  root: {
    name: `nexusdi-docs-0.3-root-r${revision}.tar.gz`,
    sha256: 'a'.repeat(64),
  },
  archive: {
    name: `nexusdi-docs-0.3-archive-r${revision}.tar.gz`,
    sha256: 'b'.repeat(64),
  },
});

const base = () => ({
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

describe('validateDeployConfig', () => {
  it('accepts the committed Phase 1 shape', () => {
    expect(validateDeployConfig(base())).toEqual([]);
  });

  it('lists the four modes in the spec order', () => {
    expect(MODES).toEqual(['snapshot-only', 'rc', 'final', 'retired']);
  });

  it('rejects an unknown mode', () => {
    expect(validateDeployConfig({ ...base(), mode: 'preview' })).toEqual([
      'mode must be one of snapshot-only, rc, final, retired; found "preview".',
    ]);
  });

  it('rejects an unknown top-level key', () => {
    expect(validateDeployConfig({ ...base(), extra: 1 })).toEqual([
      'deploy.json has an unknown key "extra".',
    ]);
  });

  it('rejects rc mode before the snapshot workflow has run', () => {
    expect(validateDeployConfig({ ...base(), mode: 'rc' })).toEqual([
      'mode "rc" needs snapshot.revision 1 or later. Run docs-snapshot.yml and merge its pull request first.',
    ]);
  });

  it('rejects assets at revision 0', () => {
    const config = base();
    config.snapshot.assets = assets(1);
    expect(validateDeployConfig(config)).toEqual([
      'snapshot.assets must be null while snapshot.revision is 0.',
    ]);
  });

  it('requires asset names that carry the revision', () => {
    const config = base();
    config.snapshot.revision = 2;
    config.snapshot.assets = assets(1);
    expect(validateDeployConfig(config)).toEqual([
      'snapshot.assets.root.name must be "nexusdi-docs-0.3-root-r2.tar.gz"; found "nexusdi-docs-0.3-root-r1.tar.gz".',
      'snapshot.assets.archive.name must be "nexusdi-docs-0.3-archive-r2.tar.gz"; found "nexusdi-docs-0.3-archive-r1.tar.gz".',
    ]);
  });

  it('requires a 64-character hex checksum', () => {
    const config = base();
    config.snapshot.revision = 1;
    config.snapshot.assets = assets(1);
    config.snapshot.assets.root.sha256 = 'xyz';
    expect(validateDeployConfig(config)).toEqual([
      'snapshot.assets.root.sha256 must be 64 lowercase hex characters.',
    ]);
  });

  it('requires a finalDate in final mode', () => {
    const config = base();
    config.mode = 'final';
    config.snapshot.revision = 1;
    config.snapshot.assets = assets(1);
    expect(validateDeployConfig(config)).toEqual([
      'mode "final" needs finalDate as YYYY-MM-DD.',
    ]);
  });

  it('rejects a finalDate before final', () => {
    expect(
      validateDeployConfig({ ...base(), finalDate: '2027-01-15' }),
    ).toEqual(['finalDate must be null in mode "snapshot-only".']);
  });

  it('requires a reason with root.sha', () => {
    const config = base();
    config.root = { tag: null, sha: 'abc1234', reason: '  ' };
    expect(validateDeployConfig(config)).toEqual([
      'root.sha is set, so root.reason must say why the root cannot wait for the next release.',
    ]);
  });

  it('rejects a root.sha that is not a commit id', () => {
    const config = base();
    config.root = { tag: null, sha: 'main', reason: 'typo on /tokens/' };
    expect(validateDeployConfig(config)).toEqual([
      'root.sha must be a 7 to 40 character commit id; found "main".',
    ]);
  });
});

describe('outputsFor', () => {
  it('writes the mode and empty asset fields at revision 0', () => {
    expect(outputsFor(base())).toEqual({
      mode: 'snapshot-only',
      revision: '0',
      root_asset: '',
      root_sha256: '',
      archive_asset: '',
      archive_sha256: '',
      root_sha: '',
    });
  });

  it('writes the asset names and checksums from revision 1', () => {
    const config = base();
    config.snapshot.revision = 1;
    config.snapshot.assets = assets(1);
    expect(outputsFor(config)).toMatchObject({
      revision: '1',
      root_asset: 'nexusdi-docs-0.3-root-r1.tar.gz',
      root_sha256: 'a'.repeat(64),
      archive_asset: 'nexusdi-docs-0.3-archive-r1.tar.gz',
      archive_sha256: 'b'.repeat(64),
    });
  });
});
