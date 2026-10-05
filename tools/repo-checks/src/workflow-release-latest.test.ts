import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { checkReleaseLatest } from './workflow-release-latest';

const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'workflow-release-latest',
);
const read = (name: string): string =>
  readFileSync(join(FIXTURES, name), 'utf8');

describe('workflow-release-latest fixtures', () => {
  it('passes a call with the flag and an argument array that carries it', () => {
    expect(checkReleaseLatest('clean.yml', read('clean.yml'))).toEqual([]);
  });

  it('fails a call without the flag and an array without it', () => {
    expect(checkReleaseLatest('sabotaged.yml', read('sabotaged.yml'))).toEqual([
      'sabotaged.yml: jobs.publish step "Create from an array" runs gh release create without --latest. GitHub marks such a release the latest; pass --latest=false, or --latest=$LATEST from the release plan.',
      'sabotaged.yml: jobs.publish step "Upload the snapshot" runs gh release create without --latest. GitHub marks such a release the latest; pass --latest=false, or --latest=$LATEST from the release plan.',
    ]);
  });
});

describe('workflow-release-latest on .github/workflows', () => {
  it('finds --latest on every gh release create', () => {
    const dir = join(workspaceRoot, '.github/workflows');
    const findings = readdirSync(dir)
      .filter((name) => /\.ya?ml$/.test(name))
      .flatMap((name) =>
        checkReleaseLatest(
          `.github/workflows/${name}`,
          readFileSync(join(dir, name), 'utf8'),
        ),
      );
    expect(findings).toEqual([]);
  });
});
