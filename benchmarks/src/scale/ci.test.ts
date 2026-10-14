import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  newestByStartedAt,
  resultsPaths,
  scaleLine,
} from '../open-results-pr.ts';

const BENCHMARKS = join(import.meta.dirname, '..', '..');
const pkg = JSON.parse(
  readFileSync(join(BENCHMARKS, 'package.json'), 'utf8'),
) as {
  nx: {
    targets: Record<
      string,
      {
        executor: string;
        cache: boolean;
        options: { cwd: string; command?: string; commands?: string[] };
      }
    >;
  };
};
const workflow = parse(
  readFileSync(
    join(BENCHMARKS, '..', '.github', 'workflows', 'benchmarks.yml'),
    'utf8',
  ),
) as {
  jobs: Record<
    string,
    {
      if?: string;
      needs?: string | string[];
      'timeout-minutes'?: number;
      steps: Array<{
        name?: string;
        run?: string;
        uses?: string;
        with?: { name?: string; path?: string };
      }>;
    }
  >;
};

describe('Nx targets (scale spec 10.4)', () => {
  const t = pkg.nx.targets;
  it.each([
    ['scale', 'node src/scale/deterministic.ts'],
    ['scale-timings', 'node src/scale/timings.ts'],
    ['scale-render', 'node src/scale/render.ts'],
  ])('%s is an uncached run-commands target', (name, command) => {
    expect(t[name]).toEqual({
      executor: 'nx:run-commands',
      cache: false,
      options: { cwd: 'benchmarks', command },
    });
  });
  it('check gains the three commands of section 10.1, after the existing ones', () => {
    const commands = t.check?.options.commands ?? [];
    expect(commands).toEqual(
      expect.arrayContaining([
        'node src/scale/deterministic.ts --check',
        'node src/scale/render.ts --check',
        'node src/scale/timings.ts --quick --sizes=50 --shapes=mixed',
      ]),
    );
    expect(commands.indexOf('node src/size.ts --check')).toBeLessThan(
      commands.indexOf('node src/scale/render.ts --check'),
    );
  });
  it('bench ends with the scale writers after the existing ones', () => {
    const commands = t.bench?.options.commands ?? [];
    expect(commands.slice(-4)).toEqual([
      'node src/timings/orchestrator.ts',
      'node src/scale/deterministic.ts',
      'node src/scale/timings.ts',
      'node src/scale/render.ts',
    ]);
  });
});

describe('benchmarks.yml (scale spec 10.2)', () => {
  const jobs = workflow.jobs;
  const runs = (job: string) =>
    (jobs[job]?.steps ?? []).flatMap((s) =>
      s.run === undefined ? [] : [s.run],
    );

  it('runs the scale timings beside the timings job, after the same steps', () => {
    const scale = jobs['scale-timings'];
    expect(scale?.if).toBe(jobs.timings?.if);
    expect(scale?.needs).toBe(jobs.timings?.needs);
    expect(scale?.['timeout-minutes']).toBe(150);
    expect(runs('scale-timings')).toEqual(
      expect.arrayContaining([
        'node benchmarks/src/release-core.ts --ref "$PUSHED_TAG"',
        'node benchmarks/src/scale/timings.ts --seed=${{ github.run_id }}',
      ]),
    );
    const download = (scale?.steps ?? []).find(
      (s) =>
        s.uses?.includes('download-artifact') &&
        s.with?.name === 'deterministic',
    );
    expect(download?.with?.path).toBe('benchmarks/results');
  });
  it('uploads the scale files and the raw samples', () => {
    const upload = (jobs['scale-timings']?.steps ?? []).find((s) =>
      s.uses?.includes('upload-artifact'),
    );
    expect(upload?.with?.name).toBe('scale-timings');
    expect(upload?.with?.path).toContain('benchmarks/results/scale/');
    expect(upload?.with?.path).toContain('benchmarks/results/raw/');
  });
  it('writes scale.json in the deterministic job', () => {
    expect(runs('deterministic')).toContain(
      'npx nx run @nexusdi/benchmarks:scale',
    );
  });
  it('merges the scale timings and renders after downloading them', () => {
    const merge = jobs.merge;
    expect(merge?.needs).toContain('scale-timings');
    const steps = merge?.steps ?? [];
    const download = steps.findIndex(
      (s) =>
        s.uses?.includes('download-artifact') &&
        s.with?.name === 'scale-timings',
    );
    const render = steps.findIndex(
      (s) => s.run === 'node benchmarks/src/scale/render.ts',
    );
    expect(download).toBeGreaterThan(-1);
    expect(steps[download]?.with?.path).toBe('benchmarks/results');
    expect(render).toBeGreaterThan(download);
  });
});

describe('open-results-pr', () => {
  it('lists the scale paths in the commit', () => {
    const paths = resultsPaths(false);
    for (const p of [
      'benchmarks/results/scale.json',
      'benchmarks/results/scale',
      'benchmarks/results/scale.md',
      'benchmarks/results/scale-startup.svg',
      'benchmarks/results/scale-bundle.svg',
      'benchmarks/results/README.md',
    ])
      expect(paths).toContain(p);
    expect(paths).not.toContain('benchmarks/results/raw');
  });
  it('adds the raw samples on a tag run', () => {
    expect(resultsPaths(true)).toContain('benchmarks/results/raw');
  });
  it('names the scale file in the body', () => {
    expect(scaleLine('2026-10-14-abc1234.json')).toBe(
      '- Scale file: benchmarks/results/scale/2026-10-14-abc1234.json',
    );
  });

  describe('newestByStartedAt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scale-newest-pr-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    it('picks the latest startedAt, not the last file name', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, '2026-10-14-zzzzzzz.json'),
        JSON.stringify({ startedAt: '2026-10-14T01:00:00Z' }),
      );
      writeFileSync(
        join(dir, '2026-10-14-aaaaaaa.json'),
        JSON.stringify({ startedAt: '2026-10-14T09:00:00Z' }),
      );
      expect(newestByStartedAt(dir)).toBe('2026-10-14-aaaaaaa.json');
    });
    it('is undefined for an empty directory', () => {
      const empty = mkdtempSync(join(tmpdir(), 'scale-empty-'));
      try {
        expect(newestByStartedAt(empty)).toBeUndefined();
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    });
  });
});
