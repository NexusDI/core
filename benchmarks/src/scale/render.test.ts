import { spawnSync } from 'node:child_process';
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

import { fixtureScale, fixtureTimings } from './render.fixture.ts';
import {
  problems,
  renderAll,
  spliceSection,
  type RenderInput,
} from './render.ts';

const GOLDEN = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  '__test__',
  'scale-render',
);
const input = (): RenderInput => ({
  scale: fixtureScale(),
  timings: fixtureTimings(),
});

describe('renderAll', () => {
  const out = renderAll(input());

  it('matches the committed scale.md', () => {
    expect(out.files['scale.md']).toBe(
      readFileSync(join(GOLDEN, 'scale.md'), 'utf8'),
    );
  });
  it('puts the round counts and skipped-cell count in the caption', () => {
    const md = out.files['scale.md'] ?? '';
    expect(md).toMatch(
      /1,000 measured rounds per size after 10 warm-up rounds/,
    );
    expect(md).toMatch(/1 library skipped above n = 200/);
  });
  it('shows a skipped cell with its outcome and a footnote', () => {
    const md = out.files['scale.md'] ?? '';
    expect(md).toMatch(/runtime-error<sup>1<\/sup>/);
    expect(md).toMatch(
      /<sup>1<\/sup> tsyringe at 1,000 providers: runtime-error \(RangeError: Maximum call stack size exceeded\)/,
    );
  });
  it('omits growth pairs that touch a failed size', () => {
    const md = out.files['scale.md'] ?? '';
    const growth = md.slice(md.indexOf('## Local growth exponents'));
    const tsyringe = growth.split('\n').find((l) => l.startsWith('| tsyringe'));
    // The fixture has a tsyringe pair 50 to 200 only.
    expect(tsyringe?.match(/\|/g)?.length).toBeGreaterThan(2);
    expect(tsyringe).toMatch(
      /\| tsyringe\s+\| \d\.\d{2} \[[^\]]+\]\s+\| -\s+\| -\s+\|/,
    );
  });
  it('writes the startup chart with an end marker for the skipped line', () => {
    const svg = out.files['scale-startup.svg'] ?? '';
    expect(svg).toMatch(
      /class="end-marker[^"]*" data-series="tsyringe" data-n="200"/,
    );
    expect(svg).toMatch(/tsyringe fails at 1,000: runtime-error/);
  });
  it('writes the bundle chart from scale.json alone', () => {
    const only = renderAll({ scale: fixtureScale() });
    expect(only.files['scale-bundle.svg']).toMatch(/<svg /);
    expect(only.files['scale-startup.svg']).toBeUndefined();
    expect(only.files['scale.md']).toMatch(/No timing run yet/);
  });
  it('states the figures and the method without framing them', () => {
    const md = out.files['scale.md'] ?? '';
    expect(md).toMatch(/1\.33 \[1\.27, 1\.40\]/);
    expect(md).not.toMatch(/is slower than|is faster than/);
    expect(md).not.toMatch(/validates the whole graph/);
  });
  it('follows the writing rules in the prose it writes', () => {
    for (const text of [...Object.values(out.files), out.readmeSection]) {
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/\b(instead of|rather than)\b/i);
      expect(text).not.toMatch(/\bnot [^.\n]* but\b/i);
      expect(text).not.toMatch(
        /\b(bites|lands|buys|earns|pays|survives|ships)\b/i,
      );
      expect(text).not.toMatch(/\bnative\b/i);
    }
  });
  it('divides bytes by 1,000 for kB', () => {
    // 50 providers retain 102,400 bytes in the fixture.
    expect(out.files['scale.md']).toContain('102.4 kB');
  });
  it('digit-groups the kinds column of the graphs table', () => {
    const scale = fixtureScale();
    const g = scale.graphs[3];
    if (g) g.kinds = { ...g.kinds, class: 4990 };
    expect(renderAll({ scale }).files['scale.md']).toContain('4,990 class');
  });
  it('states how to read the ratio in the README caption', () => {
    expect(out.readmeSection).toContain(
      "The second line is NexusDI's startup divided by the library's, with its 95% interval; above 1 means NexusDI takes longer.",
    );
  });
  it('omits growth tables that have no data columns on a partial run', () => {
    const t = fixtureTimings();
    t.graphs = t.graphs.filter((g) => g.size === 50);
    t.cells = t.cells.filter((c) => c.size === 50);
    t.results = t.results.filter((r) => r.size === 50);
    t.growth = [];
    t.marginal = [];
    const md =
      renderAll({ scale: fixtureScale(), timings: t }).files['scale.md'] ?? '';
    expect(md).not.toContain('Local growth exponents');
    expect(md).toContain('## Startup, mixed');
  });
  it('words the NexusDI create row as running every validation pass', () => {
    const md = out.files['scale.md'] ?? '';
    expect(md).toContain('runs every validation pass');
    expect(md).not.toContain('all validation passes');
  });
  it('prints the target closure size in the caption of the first-resolve table', () => {
    const md = out.files['scale.md'] ?? '';
    const at = md.indexOf('## First resolve, mixed');
    const section = md.slice(at, md.indexOf('## Ready, mixed'));
    expect(section).toMatch(
      /The target is the provider with the largest closure; a first get builds 16 providers at 50, 16 at 200, 16 at 1,000, 16 at 2,500 and 16 at 5,000 \(32%, 8\.0%, 1\.6%, 0\.64% and 0\.32% of the graph\)\./,
    );
    // Only the first-resolve table carries it.
    expect(md.slice(md.indexOf('## Ready, mixed'))).not.toMatch(
      /largest closure; a first get builds/,
    );
  });
  it('says where real-app scale ends and what 5,000 is', () => {
    const note =
      '2,500 providers is the scale of the largest applications measured, which hold 1,200 to 2,250 providers of their own. 5,000 is headroom past every application measured; no claim cites it.';
    expect(out.files['scale.md']).toContain(note);
    expect(out.readmeSection).toContain(note);
    // Also without a timing run.
    const only = renderAll({ scale: fixtureScale() });
    expect(only.files['scale.md']).toContain(note);
    expect(only.readmeSection).toContain(note);
  });
  it('is deterministic', () => {
    expect(renderAll(input())).toEqual(out);
  });
});

describe('problems', () => {
  it('finds none in matching inputs', () => {
    expect(problems(input())).toEqual([]);
  });
  it('names both hashes when the timing file was made with another generator', () => {
    const i = input();
    if (i.timings)
      i.timings.graphs = i.timings.graphs.map((g, n) =>
        n === 1 ? { ...g, hash: 'ffffffffffff' } : g,
      );
    const found = problems(i).join('\n');
    expect(found).toContain('ffffffffffff');
    expect(found).toContain(fixtureScale().graphs[1]?.hash);
  });
  it('fails when cells disagree with scale.json at a size both cover', () => {
    const i = input();
    const t = i.timings;
    const c = t?.cells.find((x) => x.library === 'awilix' && x.size === 200);
    if (c) c.outcome = 'runtime-error';
    expect(problems(i).join('\n')).toMatch(
      /awilix.*mixed 200.*runtime-error.*scale\.json.*pass/s,
    );
  });
});

describe('the newest timing file', () => {
  it('is the one with the latest startedAt, not the last filename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scale-newest-'));
    try {
      mkdirSync(join(dir, 'scale'), { recursive: true });
      writeFileSync(join(dir, 'scale.json'), JSON.stringify(fixtureScale()));
      // Same day; the later run has the earlier filename.
      const early = {
        ...fixtureTimings(),
        sha: 'zzzzzzz',
        startedAt: '2026-10-14T01:00:00Z',
      };
      const late = {
        ...fixtureTimings(),
        sha: 'aaaaaaa',
        startedAt: '2026-10-14T09:00:00Z',
      };
      writeFileSync(
        join(dir, 'scale', '2026-10-14-zzzzzzz.json'),
        JSON.stringify(early),
      );
      writeFileSync(
        join(dir, 'scale', '2026-10-14-aaaaaaa.json'),
        JSON.stringify(late),
      );
      const r = spawnSync(
        process.execPath,
        [join(import.meta.dirname, 'render.ts'), `--results=${dir}`],
        { encoding: 'utf8' },
      );
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, 'scale.md'), 'utf8')).toContain(
        'Timings from run aaaaaaa.',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('spliceSection', () => {
  const section = 'SECTION';
  it('creates the file when there is none', () => {
    const out = spliceSection(undefined, section);
    expect(out).toMatch(
      /<!-- scale:begin -->\n\nSECTION\n\n<!-- scale:end -->/,
    );
  });
  it('replaces only what lies between the markers', () => {
    const before =
      'intro\n\n<!-- scale:begin -->\n\nold\n\n<!-- scale:end -->\n\noutro\n';
    expect(spliceSection(before, section)).toBe(
      'intro\n\n<!-- scale:begin -->\n\nSECTION\n\n<!-- scale:end -->\n\noutro\n',
    );
  });
  it('appends the section to a file without markers', () => {
    expect(spliceSection('intro\n', section)).toBe(
      'intro\n\n<!-- scale:begin -->\n\nSECTION\n\n<!-- scale:end -->\n',
    );
  });
});

describe('render.ts as a command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scale-render-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [join(import.meta.dirname, 'render.ts'), `--results=${dir}`, ...args],
      { encoding: 'utf8' },
    );
  mkdirSync(join(dir, 'scale'), { recursive: true });
  writeFileSync(join(dir, 'scale.json'), JSON.stringify(fixtureScale()));
  writeFileSync(
    join(dir, 'scale', '2026-10-14-abc1234.json'),
    JSON.stringify(fixtureTimings()),
  );

  it('fails --check before the files exist, then passes after a write', () => {
    expect(run('--check').status).toBe(1);
    expect(run('--check').stderr).toMatch(/stale: .*scale\.md/);
    expect(run().status).toBe(0);
    expect(run('--check').status).toBe(0);
  }, 30_000);
  it('fails --check when a file was edited', () => {
    writeFileSync(join(dir, 'scale.md'), 'edited\n');
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/stale: scale\.md/);
  }, 30_000);
  it('fails with both hashes when the inputs disagree', () => {
    const t = fixtureTimings();
    t.graphs = t.graphs.map((g, n) =>
      n === 0 ? { ...g, hash: 'ffffffffffff' } : g,
    );
    writeFileSync(
      join(dir, 'scale', '2026-10-14-abc1234.json'),
      JSON.stringify(t),
    );
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ffffffffffff');
    expect(r.stderr).toContain(fixtureScale().graphs[0]?.hash);
  }, 30_000);
});
