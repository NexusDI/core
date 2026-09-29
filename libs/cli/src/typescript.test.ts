import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { makeProject } from '../test-support/project.js';
import { FIXTURES, runCli } from '../test-support/run.js';

const STRIPPABLE = {
  'src/navigation.module.ts': `import { Token, defineModule, provide } from '@nexusdi/core';
interface INavCharts { plot(to: string): string }
export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StellarCharts implements INavCharts { plot(to: string): string { return to; } }
export const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
  exports: [NAV_CHARTS],
});
`,
  'src/meridian.module.ts': `import { defineModule } from '@nexusdi/core';
import { Navigation } from './navigation.module.ts';
export default defineModule({ name: 'Meridian', imports: [Navigation] });
`,
};

describe('nexusdi graph, TypeScript entries', () => {
  it('loads a TS entry with .js specifiers and decorators through tsx', () => {
    const run = runCli(['graph', 'meridian.module.ts#Meridian', '-f', 'json'], {
      cwd: join(FIXTURES, 'ts'),
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const graph = JSON.parse(run.stdout) as {
      providers: { token: string; implementation: string | null }[];
    };
    expect(graph.providers).toContainEqual(
      expect.objectContaining({
        token: 'ShipComputer',
        implementation: 'ShipComputer',
      }),
    );
  });

  it('loads erasable TypeScript through type stripping when the project has no tsx', () => {
    const cwd = makeProject(STRIPPABLE, ['core', 'devtools']);
    const run = runCli(['graph', 'src/meridian.module.ts', '-f', 'dot'], {
      cwd,
    });
    // stderr may carry Node's type-stripping ExperimentalWarning.
    expect(run.stderr).not.toContain('nexusdi:');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('NavCharts');
  });

  it('exits 3 with the tsx install line for a .js specifier to a .ts file without tsx', () => {
    const cwd = makeProject(
      {
        ...STRIPPABLE,
        'src/meridian.module.ts': STRIPPABLE['src/meridian.module.ts'].replace(
          './navigation.module.ts',
          './navigation.module.js',
        ),
      },
      ['core', 'devtools'],
    );
    const run = runCli(['graph', 'src/meridian.module.ts'], { cwd });
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('ERR_MODULE_NOT_FOUND');
    expect(run.stderr).toContain('Install tsx in the project: npm i -D tsx');
  });

  it('exits 3 when this Node has no type stripping and the project has no tsx', () => {
    const cwd = makeProject(STRIPPABLE, ['core', 'devtools']);
    const run = runCli(['graph', 'src/meridian.module.ts'], {
      cwd,
      nodeArgs: ['--no-experimental-strip-types'],
    });
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('ERR_UNKNOWN_FILE_EXTENSION');
  });

  it('exits 3 when the project has no @nexusdi/devtools', () => {
    const cwd = makeProject(STRIPPABLE, ['core']);
    const run = runCli(['graph', 'src/meridian.module.ts'], { cwd });
    expect(run.status).toBe(3);
    expect(run.stderr).toMatch(
      /@nexusdi\/devtools \S+ is required next to @nexusdi\/cli \S+; found none\./,
    );
  });

  it('exits 3 when the project has @nexusdi/devtools at another version', () => {
    const cwd = makeProject(
      {
        ...STRIPPABLE,
        'node_modules/@nexusdi/devtools/package.json': JSON.stringify({
          name: '@nexusdi/devtools',
          version: '0.0.1',
          type: 'module',
          exports: { '.': './index.js', './package.json': './package.json' },
        }),
        'node_modules/@nexusdi/devtools/index.js': 'export {};\n',
      },
      ['core'],
    );
    const run = runCli(['graph', 'src/meridian.module.ts'], { cwd });
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('found 0.0.1');
  });
});
