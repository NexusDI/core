import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { checkTrigger, covers } from './docs/docs-trigger';
import { FIXTURES } from './docs/paths';

const read = (name: string) =>
  parse(readFileSync(join(FIXTURES, 'docs-trigger', name), 'utf8')) as unknown;
const ROOTS = [
  'libs/core',
  'internal/meridian-ui',
  'tools/doc-examples',
  'examples/meridian',
];

describe('docs-trigger fixtures', () => {
  it('matches a root against a /** glob and an exact path', () => {
    expect(covers(['libs/**'], 'libs/core')).toBe(true);
    expect(covers(['package.json'], 'package.json')).toBe(true);
    expect(covers(['libs/**'], 'internal/meridian-ui')).toBe(false);
  });

  it('passes a workflow whose filter covers every input', () => {
    expect(checkTrigger(read('clean.yml'), ROOTS)).toEqual([]);
  });

  it('fails a missing path, a missing release tag, no manual run and an uncovered root', () => {
    expect(checkTrigger(read('sabotaged.yml'), ROOTS)).toEqual([
      "docs.yml: on.push.paths does not cover 'internal/meridian-ui', a project the site builds from. A change there would deploy nothing.",
      "docs.yml: on.push.paths lacks 'internal/**' (spec section 15.3).",
      "docs.yml: on.push.tags lacks '@nexusdi/core@*'. A release must rebuild the root site.",
      'docs.yml: on.workflow_dispatch is missing. A person must be able to redeploy by hand.',
    ]);
  });
});
