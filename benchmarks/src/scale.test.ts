import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { generateScale } from './scale.ts';

const TMP = join(import.meta.dirname, '..', 'tmp', 'scale-test');

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('generateScale', () => {
  it('writes 200 classes, tokens and main for an interface-first variant', () => {
    const files = generateScale('nexusdi', 'plain', join(TMP, 'nexusdi'));
    expect(files).toHaveLength(202);
  });
  it('wires c_L_P to c_(L-1)_P and c_(L-1)_(P+1)', () => {
    const text = readFileSync(join(TMP, 'nexusdi', 'c_19_0.ts'), 'utf8');
    expect(text).toContain('static deps = [Tc_18_0, Tc_18_1] as const;');
    const edge = readFileSync(join(TMP, 'nexusdi', 'c_19_9.ts'), 'utf8');
    expect(edge).toContain('[Tc_18_9, Tc_18_0]');
  });
  it('writes cradle constructors for awilix', () => {
    const files = generateScale('awilix', 'plain', join(TMP, 'awilix'));
    expect(files).toHaveLength(201);
    expect(readFileSync(join(TMP, 'awilix', 'c_19_0.ts'), 'utf8')).toContain(
      'constructor({ c_18_0, c_18_1 }: { c_18_0: c_18_0; c_18_1: c_18_1 })',
    );
  });
  it('type-checks the NexusDI output against the workspace core', () => {
    writeFileSync(
      join(TMP, 'nexusdi', 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'es2022',
          module: 'nodenext',
          moduleResolution: 'nodenext',
          lib: ['es2022', 'esnext.disposable', 'esnext.decorators', 'dom'],
          types: [],
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          customConditions: ['@nexusdi/source'],
        },
        include: ['*.ts'],
      }),
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [
          join(
            import.meta.dirname,
            '..',
            '..',
            'node_modules',
            'typescript',
            'bin',
            'tsc',
          ),
          '-p',
          join(TMP, 'nexusdi', 'tsconfig.json'),
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      ),
    ).not.toThrow();
  }, 120_000);
});
