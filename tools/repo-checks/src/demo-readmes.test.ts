import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, dirname } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { afterEach, describe, expect, it } from 'vitest';

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

  describe('error code anchors', () => {
    const SRC = `
const DOCS = 'https://github.com/NexusDI/core/tree/main/examples/demo#';
export class A extends errorBase<'DEMO_A', Fields>('DEMO_A', 'AError', DOCS) {}
export class B extends errorBase<
  'DEMO_B',
  Fields
>('DEMO_B', 'BError', DOCS) {}
`;
    const withAnchors = (...codes: string[]) =>
      GOOD + codes.map((c) => `\n<a id="${c}"></a>\n\n### ${c}\n`).join('');
    const input = (source: string, sources: string[] = [SRC]) => ({
      source,
      config: CONFIG,
      project: 'demo',
      sources,
    });

    it('passes when every linked code has an anchor', () => {
      expect(demoReadmeFaults(input(withAnchors('DEMO_A', 'DEMO_B')))).toEqual(
        [],
      );
    });

    it('names the code that has no anchor', () => {
      expect(demoReadmeFaults(input(withAnchors('DEMO_A')))).toEqual([
        {
          rule: 'error-codes',
          message:
            'src links DEMO_B to the README, which has no <a id="DEMO_B"></a> anchor',
        },
      ]);
    });

    it('ignores a source that links another project', () => {
      const other = SRC.replace('examples/demo#', 'examples/other#');
      expect(demoReadmeFaults(input(GOOD, [other]))).toEqual([]);
    });
  });

  it('allows a NEXUS_ error code in prose', () => {
    const source = GOOD.replace(
      'Try it.',
      'It rejects with NEXUS_PROVIDER_FAILED.',
    );
    expect(demoReadmeFaults({ source, config: CONFIG })).toEqual([]);
  });
});

/** The config files a demo's vitest run may read, in the order this check tries them. */
const CONFIG_FILES = [
  'vitest.config.mts',
  'vitest.config.ts',
  'vite.config.ts',
  'vite.config.mts',
] as const;

function vitestConfigPath(dir: string): string {
  const file = CONFIG_FILES.find((name) => existsSync(join(dir, name)));
  if (file === undefined)
    throw new Error(
      `${dir} holds none of ${CONFIG_FILES.join(', ')}; add the vitest config that runs the README.`,
    );
  return join(dir, file);
}

describe('the demo config lookup', () => {
  const dirs: string[] = [];
  const demo = (...files: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'demo-config-'));
    dirs.push(dir);
    for (const file of files) writeFileSync(join(dir, file), '');
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  it('prefers vitest.config.mts, then falls back to vite.config.ts', () => {
    expect(
      vitestConfigPath(demo('vitest.config.mts', 'vite.config.ts')),
    ).toMatch(/vitest\.config\.mts$/);
    expect(vitestConfigPath(demo('vite.config.ts'))).toMatch(
      /vite\.config\.ts$/,
    );
  });

  it('names the files it looked for when a demo has none', () => {
    expect(() => vitestConfigPath(demo())).toThrow(/vite\.config\.mts/);
  });
});

describe('demo READMEs', () => {
  it.each(DEMO_READMES)('%s holds', (readme) => {
    const dir = dirname(join(workspaceRoot, readme));
    const config = readFileSync(vitestConfigPath(dir), 'utf8');
    const source = readFileSync(join(workspaceRoot, readme), 'utf8');
    const project = basename(dir);
    const sources = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter(
        (f) =>
          f.endsWith('.ts') &&
          !/(^|\/)(node_modules|dist|build|\.react-router)\//.test(f),
      )
      .map((f) => readFileSync(join(dir, f), 'utf8'));
    expect(demoReadmeFaults({ source, config, project, sources })).toEqual([]);
  });
});
