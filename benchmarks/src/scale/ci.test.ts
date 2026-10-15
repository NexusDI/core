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
const WORKFLOW = join(
  BENCHMARKS,
  '..',
  '.github',
  'workflows',
  'benchmarks.yml',
);
const workflow = parse(readFileSync(WORKFLOW, 'utf8')) as {
  jobs: Record<
    string,
    {
      if?: string;
      name?: string;
      needs?: string | string[];
      'timeout-minutes'?: number | string;
      strategy?: {
        'fail-fast'?: boolean;
        matrix: { include: Array<{ part: string; timeout: number }> };
      };
      steps: Array<{
        name?: string;
        run?: string;
        if?: string;
        uses?: string;
        with?: {
          name?: string;
          path?: string;
          pattern?: string;
          'merge-multiple'?: boolean;
        };
      }>;
    }
  >;
  on: { workflow_dispatch?: { inputs?: Record<string, { type?: string }> } };
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

  const scale = jobs.scale;
  const parts = scale?.strategy?.matrix.include ?? [];

  it('runs one job per shape and one for the steady get-cycle, each with its own timeout', () => {
    expect(Object.fromEntries(parts.map((p) => [p.part, p.timeout]))).toEqual({
      mixed: 330,
      wide: 120,
      deep: 120,
      modular: 120,
      'mixed-async': 120,
      steady: 30,
    });
    expect(scale?.['timeout-minutes']).toBe('${{ matrix.timeout }}');
    expect(scale?.name).toBe('scale-${{ matrix.part }}');
  });
  it('cancels the rest when one part fails, so a partial file is never published', () => {
    expect(scale?.strategy?.['fail-fast']).toBe(true);
  });
  it('runs on a tag, the schedule and a dispatch, and not on a pull request', () => {
    expect(scale?.if).toBe("github.event_name != 'pull_request'");
  });
  it('runs after the same steps as the timings job', () => {
    expect(scale?.needs).toBe(jobs.timings?.needs);
    expect(
      (scale?.steps ?? []).flatMap((s) => (s.run === undefined ? [] : [s.run])),
    ).toEqual(
      expect.arrayContaining([
        'node benchmarks/src/release-core.ts --ref "$PUSHED_TAG"',
      ]),
    );
    const download = (scale?.steps ?? []).find(
      (s) =>
        s.uses?.includes('download-artifact') &&
        s.with?.name === 'deterministic',
    );
    expect(download?.with?.path).toBe('benchmarks/results');
  });
  it('times its own part with the run id as the seed and uploads it as scale-timings-<part>', () => {
    const run = (scale?.steps ?? []).find((s) =>
      s.run?.includes('scale/timings.ts'),
    );
    expect(run?.run).toContain('--part=${{ matrix.part }}');
    expect(run?.run).toContain('--seed=${{ github.run_id }}');
    const upload = (scale?.steps ?? []).find((s) =>
      s.uses?.includes('upload-artifact'),
    );
    expect(upload?.with?.name).toBe('scale-timings-${{ matrix.part }}');
    expect(upload?.with?.path).toBe('benchmarks/results/scale-parts');
  });
  it('has no protocol-check input and passes no --protocol-check', () => {
    const text = readFileSync(WORKFLOW, 'utf8');
    expect(text).not.toMatch(/protocol[-_]check/);
    expect(
      workflow.on.workflow_dispatch?.inputs?.protocol_check,
    ).toBeUndefined();
  });
  it('merges when scale is skipped, and not when it failed', () => {
    expect(jobs.merge?.if).toBe(
      "${{ !cancelled() && needs.deterministic.result == 'success' && needs.build-meridian-8.result == 'success' && needs.build-scale-200.result == 'success' && needs.timings.result == 'success' && needs.scale.result != 'failure' }}",
    );
  });
  it('downloads and merges the scale parts only when scale succeeded', () => {
    const steps = jobs.merge?.steps ?? [];
    const guarded = steps.filter(
      (s) =>
        s.with?.pattern === 'scale-timings-*' ||
        s.run === 'node benchmarks/src/scale/timings.ts --merge',
    );
    expect(guarded).toHaveLength(2);
    for (const s of guarded)
      expect(s.if).toBe("${{ needs.scale.result == 'success' }}");
  });
  it('merges the scale parts as well as the jobs that finish', () => {
    expect(jobs.merge?.needs).toEqual([
      'deterministic',
      'build-meridian-8',
      'build-scale-200',
      'timings',
      'scale',
    ]);
  });
  it('writes scale.json in the deterministic job', () => {
    expect(runs('deterministic')).toContain(
      'npx nx run @nexusdi/benchmarks:scale',
    );
  });
  it('downloads every scale part, merges them, then renders the page', () => {
    const steps = jobs.merge?.steps ?? [];
    const download = steps.findIndex(
      (s) => s.with?.pattern === 'scale-timings-*',
    );
    const merge = steps.findIndex(
      (s) => s.run === 'node benchmarks/src/scale/timings.ts --merge',
    );
    const render = steps.findIndex(
      (s) => s.run === 'node benchmarks/src/scale/render.ts',
    );
    expect(download).toBeGreaterThan(-1);
    expect(steps[download]?.with?.['merge-multiple']).toBe(true);
    expect(steps[download]?.with?.path).toBe('benchmarks/results/scale-parts');
    expect(merge).toBeGreaterThan(download);
    expect(render).toBeGreaterThan(merge);
  });
});

describe('open-results-pr', () => {
  /** A results root holding the named paths, `dir/` entries as directories. */
  const rootWith = (paths: string[]) => {
    const root = mkdtempSync(join(tmpdir(), 'results-root-'));
    roots.push(root);
    for (const p of paths)
      if (p.endsWith('/')) mkdirSync(join(root, p), { recursive: true });
      else {
        mkdirSync(join(root, p, '..'), { recursive: true });
        writeFileSync(join(root, p), '');
      }
    return root;
  };
  const roots: string[] = [];
  afterAll(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });
  const R = 'benchmarks/results';
  const EVERYTHING = [
    `${R}/matrix.json`,
    `${R}/probes.json`,
    `${R}/size.json`,
    `${R}/scale.json`,
    `${R}/build.json`,
    `${R}/timings/`,
    `${R}/scale/`,
    `${R}/scale.md`,
    `${R}/scale-startup.svg`,
    `${R}/scale-bundle.svg`,
    `${R}/README.md`,
    `${R}/raw/`,
  ];

  it('lists the scale paths in the commit when they exist', () => {
    const paths = resultsPaths(false, rootWith(EVERYTHING));
    for (const p of [
      `${R}/scale.json`,
      `${R}/scale`,
      `${R}/scale.md`,
      `${R}/scale-startup.svg`,
      `${R}/scale-bundle.svg`,
      `${R}/README.md`,
    ])
      expect(paths).toContain(p);
    expect(paths).not.toContain(`${R}/raw`);
  });
  it('leaves out scale/ and the startup chart when no timing run made them', () => {
    // git add exits 128 on a missing pathspec, which would lose every result.
    const without = EVERYTHING.filter(
      (p) => p !== `${R}/scale/` && p !== `${R}/scale-startup.svg`,
    );
    const paths = resultsPaths(false, rootWith(without));
    expect(paths).not.toContain(`${R}/scale`);
    expect(paths).not.toContain(`${R}/scale-startup.svg`);
    expect(paths).toContain(`${R}/scale.md`);
    expect(paths).toContain(`${R}/timings`);
  });
  it('adds the raw samples on a tag run, when they exist', () => {
    expect(resultsPaths(true, rootWith(EVERYTHING))).toContain(`${R}/raw`);
    expect(
      resultsPaths(true, rootWith(EVERYTHING.filter((p) => p !== `${R}/raw/`))),
    ).not.toContain(`${R}/raw`);
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
    it('is undefined for a directory that does not exist', () => {
      expect(newestByStartedAt(join(dir, 'missing'))).toBeUndefined();
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
