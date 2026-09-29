import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { makeProject } from '../test-support/project.js';
import { FIXTURES, runCli } from '../test-support/run.js';

const JS = join(FIXTURES, 'js');
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe('nexusdi graph, images', () => {
  it('writes svg through @viz-js/viz', () => {
    const run = runCli(['graph', 'meridian.module.js', '-f', 'svg'], {
      cwd: JS,
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('<svg');
    expect(run.stdout).toContain('NavCharts');
  });

  it('writes png through @resvg/resvg-js to --out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexusdi-cli-'));
    const run = runCli(
      ['graph', 'meridian.module.js', '-o', join(dir, 'g.png')],
      { cwd: JS },
    );
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(readFileSync(join(dir, 'g.png')).subarray(0, 8)).toEqual(
      PNG_SIGNATURE,
    );
  });

  it('writes png bytes to a pipe', () => {
    const run = runCli(['graph', 'meridian.module.js', '-f', 'png'], {
      cwd: JS,
    });
    expect(run.status).toBe(0);
    expect(run.bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it('escapes names in the svg', () => {
    const cwd = makeProject(
      {
        'm.js': `import { Token, defineModule, provide } from '@nexusdi/core';
const T = new Token('a<b>&"c');
export default defineModule({ name: 'Bay', providers: [provide(T, { useValue: 1 })] });
`,
      },
      ['core', 'devtools'],
    );
    const run = runCli(['graph', 'm.js', '-f', 'svg'], { cwd });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('a&lt;b&gt;&amp;&quot;c');
  });
});
