import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  CONTRACT_FILE,
  caseNames,
  contractGaps,
  scanCases,
  contractFiles,
  type ContractRow,
} from './demo-contracts.js';
import { filesUnder } from './entry-graph.js';

const EXAMPLES = join(workspaceRoot, 'examples');

const SUITE = `
import { describe, expect, it, test } from 'vitest';

describe('a group', () => {
  it('first case', () => {});
  test('second case', () => {});
  it(\`third case\`, async () => {});
});
it.skip('skipped case', () => {});
helper('not a case');
`;

describe('caseNames', () => {
  it('reads the literal name of each it and test call, nested or not', () => {
    expect(caseNames('a.contract.test.ts', SUITE)).toEqual([
      'first case',
      'second case',
      'third case',
    ]);
  });
});

const scan = (source: string) => scanCases('a.contract.test.ts', source);

describe('scanCases', () => {
  it('counts it.only and test.concurrent as cases', () => {
    expect(
      scan(`it.only('a', () => {}); test.concurrent('b', () => {});`),
    ).toEqual({ names: ['a', 'b'], skipped: [], problems: [] });
  });

  it('lists a skipped or todo case apart from the active ones', () => {
    expect(
      scan(`it.skip('a', () => {}); it.todo('b'); it('c', () => {});`),
    ).toEqual({ names: ['c'], skipped: ['a', 'b'], problems: [] });
  });

  it('counts the call of it.each(table)(name, fn) and test.for(table)(name, fn) once', () => {
    expect(
      scan(
        `it.each([1, 2])('row %s', () => {}); test.for([1])('for %s', () => {});`,
      ),
    ).toEqual({ names: ['row %s', 'for %s'], skipped: [], problems: [] });
  });

  it('reports a case whose name is not a literal', () => {
    expect(
      scan(`const n = 'x'; it(n, () => {}); it(\`a\${n}\`, () => {});`),
    ).toMatchObject({
      names: [],
      problems: [expect.any(String), expect.any(String)],
    });
  });

  it('reports two cases of one name in one file', () => {
    const { problems } = scan(`it('a', () => {}); it.skip('a', () => {});`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('a');
  });
});

const row = (file: string, test: string): ContractRow => ({
  feature: `feature of ${test}`,
  file,
  test,
});

describe('contractGaps', () => {
  const cases = [
    { file: 'a/x.contract.test.ts', name: 'one' },
    { file: 'a/x.contract.test.ts', name: 'two' },
  ];

  it('accepts a manifest whose rows and cases match', () => {
    expect(
      contractGaps(
        [
          row('a/x.contract.test.ts', 'one'),
          row('a/x.contract.test.ts', 'two'),
        ],
        cases,
      ),
    ).toEqual({ withoutCase: [], withoutRow: [] });
  });

  it('reports a row with no case in its file', () => {
    expect(
      contractGaps(
        [
          row('a/x.contract.test.ts', 'one'),
          row('a/x.contract.test.ts', 'two'),
          row('a/x.contract.test.ts', 'three'),
        ],
        cases,
      ).withoutCase,
    ).toEqual([row('a/x.contract.test.ts', 'three')]);
  });

  it('does not let a skipped case satisfy a row, and still lists it as unlisted', () => {
    const skipped = [
      { file: 'a/x.contract.test.ts', name: 'one', skipped: true },
    ];
    const gaps = contractGaps([row('a/x.contract.test.ts', 'one')], skipped);
    expect(gaps.withoutCase).toEqual([row('a/x.contract.test.ts', 'one')]);
    expect(contractGaps([], skipped).withoutRow).toEqual(skipped);
  });

  it('reports a case with no row', () => {
    expect(
      contractGaps([row('a/x.contract.test.ts', 'one')], cases).withoutRow,
    ).toEqual([{ file: 'a/x.contract.test.ts', name: 'two' }]);
  });
});

describe('the feature-contract suite', () => {
  const rows = (
    JSON.parse(
      readFileSync(join(EXAMPLES, 'feature-contracts.json'), 'utf8'),
    ) as { contracts: ContractRow[] }
  ).contracts;
  const files = contractFiles(filesUnder(EXAMPLES));
  const scanned = files.map((file) => ({
    file,
    ...scanCases(file, readFileSync(join(EXAMPLES, file), 'utf8')),
  }));
  const cases = scanned.flatMap(({ file, names, skipped }) => [
    ...names.map((name) => ({ file, name })),
    ...skipped.map((name) => ({ file, name, skipped: true })),
  ]);

  it('reads every case by a literal name, once per file', () => {
    expect(
      scanned.flatMap(({ file, problems }) =>
        problems.map((p) => `${file}: ${p}`),
      ),
    ).toEqual([]);
  });

  it('lists a case in a contract file for every row', () => {
    expect(contractGaps(rows, cases).withoutCase).toEqual([]);
  });

  it('lists a row for every case in a contract file', () => {
    expect(contractGaps(rows, cases).withoutRow).toEqual([]);
  });

  it('names each file as a contract file, once per case', () => {
    for (const { file } of rows) expect(file).toMatch(CONTRACT_FILE);
    const keys = rows.map(({ file, test }) => `${file}\n${test}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
