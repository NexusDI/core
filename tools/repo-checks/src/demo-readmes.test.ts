import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  DEMO_READMES,
  demoReadmeFaults,
  type DemoReadmeInput,
  type DemoRule,
} from './demo-readmes.js';

const CONFIG = `
import { docExampleSources, docExamples } from '@nexusdi/doc-examples';
export default defineConfig(() => ({
  ...docExamples(),
  test: { includeSource: ['README.md'] },
}));
`;

const GOOD = `# Demo

Try it.

\`\`\`ts @import.meta.vitest
const answer = 42;
answer; // -> 42
\`\`\`
`;

const rulesOf = (input: DemoReadmeInput): DemoRule[] => [
  ...new Set(demoReadmeFaults(input).map((f) => f.rule)),
];

describe('demo-readmes fixtures', () => {
  it('passes a README with a doctest, a claim and a wired config', () => {
    expect(demoReadmeFaults({ source: GOOD, config: CONFIG })).toEqual([]);
  });

  it('fails a plain ts block', () => {
    const source = GOOD + '\n```ts\nconst a = 1;\n```\n';
    expect(rulesOf({ source, config: CONFIG })).toEqual(['doctests']);
  });

  it('fails a typescript block', () => {
    const source = GOOD + '\n```typescript\nconst a = 1;\n```\n';
    expect(rulesOf({ source, config: CONFIG })).toEqual(['doctests']);
  });

  it('fails a README with no doctest', () => {
    expect(rulesOf({ source: '# Demo\n\nText.\n', config: CONFIG })).toEqual([
      'doctests',
    ]);
  });

  it('fails a doctest with no claim', () => {
    const source = GOOD.replace('// -> 42', '');
    expect(rulesOf({ source, config: CONFIG })).toEqual(['claim']);
  });

  it('fails a doctest that binds a class to a class', () => {
    const source = GOOD.replace(
      'const answer = 42;',
      'const answer = 42;\nprovide(Foo, { useClass: Bar });',
    );
    expect(rulesOf({ source, config: CONFIG })).toEqual(['interface-first']);
  });

  it('fails a doctest that types a token as any', () => {
    const source = GOOD.replace(
      'const answer = 42;',
      "const answer = 42;\nconst TOKEN = new Token<any>('Any');",
    );
    expect(rulesOf({ source, config: CONFIG })).toEqual(['interface-first']);
  });

  it('fails a config without docExamples()', () => {
    const config = CONFIG.replace('...docExamples(),', '');
    expect(rulesOf({ source: GOOD, config })).toEqual(['wiring']);
  });

  it('fails a config that leaves README.md out of includeSource', () => {
    const config = CONFIG.replace("['README.md']", "['src/**/*.ts']");
    expect(rulesOf({ source: GOOD, config })).toEqual(['wiring']);
  });

  it('accepts includeSource from docExampleSources()', () => {
    const config = CONFIG.replace("['README.md']", 'docExampleSources()');
    expect(demoReadmeFaults({ source: GOOD, config })).toEqual([]);
  });

  it.each([
    ['an em dash', 'The ship — a freighter.', 'banned-prose'],
    ['antithesis', 'It is not a toy but a model.', 'banned-prose'],
    ['instead of', 'Use a token instead of a class.', 'banned-prose'],
    ['native', 'A native module.', 'banned'],
    ['reflect-metadata', 'Import reflect-metadata first.', 'banned'],
  ] as const)('fails %s in prose', (_name, line, rule) => {
    const source = GOOD.replace('Try it.', line);
    expect(rulesOf({ source, config: CONFIG })).toEqual([rule]);
  });

  it('leaves prose rules out of code fences', () => {
    const source = GOOD.replace(
      'answer; // -> 42',
      'answer; // -> 42\n// not a but b',
    );
    expect(demoReadmeFaults({ source, config: CONFIG })).toEqual([]);
  });

  it('allows a NEXUS_ error code in prose', () => {
    const source = GOOD.replace(
      'Try it.',
      'It rejects with NEXUS_PROVIDER_FAILED.',
    );
    expect(demoReadmeFaults({ source, config: CONFIG })).toEqual([]);
  });
});

describe('demo READMEs', () => {
  it.each(DEMO_READMES)('%s holds', (readme) => {
    const dir = dirname(join(workspaceRoot, readme));
    const config = readFileSync(join(dir, 'vitest.config.mts'), 'utf8');
    const source = readFileSync(join(workspaceRoot, readme), 'utf8');
    expect(demoReadmeFaults({ source, config })).toEqual([]);
  });
});
