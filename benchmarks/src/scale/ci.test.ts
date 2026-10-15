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

  it('has no scale-timings job until the budget follow-up: a job that cannot finish would drop the Meridian-8 results on a tag', () => {
    expect(jobs['scale-timings']).toBeUndefined();
    expect(JSON.stringify(workflow)).not.toContain('scale-timings');
  });
  it('merges only the jobs that finish', () => {
    expect(jobs.merge?.needs).toEqual([
      'deterministic',
      'build-meridian-8',
      'build-scale-200',
      'timings',
    ]);
  });
  it('writes scale.json in the deterministic job', () => {
    expect(runs('deterministic')).toContain(
      'npx nx run @nexusdi/benchmarks:scale',
    );
  });
  it('renders the deterministic scale page in the merge job', () => {
    const steps = jobs.merge?.steps ?? [];
    const deterministic = steps.findIndex(
      (s) =>
        s.uses?.includes('download-artifact') &&
        s.with?.name === 'deterministic',
    );
    const render = steps.findIndex(
      (s) => s.run === 'node benchmarks/src/scale/render.ts',
    );
    expect(deterministic).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(deterministic);
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
