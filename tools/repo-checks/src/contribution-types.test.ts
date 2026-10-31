import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  CONTRIBUTION_ALLOWANCE,
  CONTRIBUTION_POINTS,
  contributionTypeViolations,
} from './contribution-types.js';

const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'contribution-types',
);

const entry = (name: string) => [join(FIXTURES, name, 'src', 'index.ts')];

describe('contributionTypeViolations', () => {
  it('accepts a contribution point that names only exported types and its own type parameters', () => {
    expect(
      contributionTypeViolations(
        entry('clean'),
        ['View', 'Holder', 'make'],
        {},
      ),
    ).toEqual([]);
  });

  it('reports each unexported type a member, parameter or return names, once per point', () => {
    expect(
      contributionTypeViolations(entry('sabotaged'), ['View', 'make'], {}),
    ).toEqual([
      'View names Hidden, which no entry exports',
      'View names Reserved, which no entry exports',
      'make names Hidden, which no entry exports',
    ]);
  });

  it('lets an allowance name a type with its reason', () => {
    expect(
      contributionTypeViolations(entry('sabotaged'), ['View', 'make'], {
        Hidden: 'a reader names it through an exported alias',
        Reserved: 'the mapped key set',
      }),
    ).toEqual([]);
  });

  it('fails an allowance entry that no contribution point uses', () => {
    expect(
      contributionTypeViolations(entry('clean'), ['View'], {
        Gone: 'a type nothing names any more',
      }),
    ).toEqual(['the allowance for Gone is stale; no point names it']);
  });

  it('fails a contribution point that no entry exports', () => {
    expect(contributionTypeViolations(entry('clean'), ['Missing'], {})).toEqual(
      ['Missing is not exported by any entry'],
    );
  });

  it('gives every allowance entry a reason', () => {
    for (const [name, reason] of Object.entries(CONTRIBUTION_ALLOWANCE)) {
      expect(reason.length, name).toBeGreaterThan(10);
    }
  });
});

describe('core', () => {
  it('exports every type its contribution points name', () => {
    const src = join(workspaceRoot, 'libs', 'core', 'src');
    expect(
      contributionTypeViolations(
        [join(src, 'index.ts'), join(src, 'text', 'index.ts')],
        CONTRIBUTION_POINTS,
        CONTRIBUTION_ALLOWANCE,
      ),
    ).toEqual([]);
  });
});
