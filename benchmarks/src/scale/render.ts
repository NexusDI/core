/**
 * Renders the scale suite's results page (scale spec section 9 and 14.4):
 * results/scale.md, results/scale-startup.svg, results/scale-bundle.svg and
 * the "Scaling" section of results/README.md between generated markers. A
 * pure function of results/scale.json and the newest results/scale/ file.
 *
 *   node src/scale/render.ts           writes the files
 *   node src/scale/render.ts --results=<dir>   reads and writes <dir> instead of results/
 *   node src/scale/render.ts --check   fails when a file differs, when the two
 *                                      inputs disagree on a graph hash, or when
 *                                      their cells disagree
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { argValue } from '../cli.ts';
import { BENCHMARKS } from '../libraries.ts';
import {
  LIBRARIES,
  type LibraryId,
  type ScaleCell,
  type ScaleFile,
  type ScaleTimingRow,
  type ScaleTimingsFile,
} from '../schema.ts';
import { SHAPES, SIZES, type Shape } from './config.ts';
import { renderChart, type ChartInput, type ChartSeries } from './svg.ts';

export interface RenderInput {
  scale: ScaleFile;
  /** The newest results/scale/ file; absent before the first timing run. */
  timings?: ScaleTimingsFile;
}

const NAMES: Record<LibraryId, string> = {
  nexusdi: 'NexusDI',
  inversify: 'InversifyJS',
  tsyringe: 'tsyringe',
  awilix: 'awilix',
  'needle-di': 'needle-di',
};

const BEGIN = '<!-- scale:begin -->';
const END = '<!-- scale:end -->';

const group = (n: number) => n.toLocaleString('en-US');
const ms = (ns: number) => (ns / 1e6).toFixed(2);
const list = (xs: readonly string[]) =>
  xs.length < 2
    ? xs.join('')
    : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** A markdown table with padded columns, as prettier writes one. */
function table(header: string[], rows: string[][]): string {
  const width = header.map((h, i) =>
    Math.max(3, h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((c, i) => c.padEnd(width[i] ?? 0)).join(' | ')} |`;
  return [
    line(header),
    `| ${width.map((w) => '-'.repeat(w)).join(' | ')} |`,
    ...rows.map(line),
  ].join('\n');
}

type Cell = Pick<
  ScaleCell,
  'library' | 'variant' | 'shape' | 'size' | 'outcome' | 'message'
>;

/** What the cells of a run say about each library and size of a shape. */
function cellsOf(input: RenderInput, shape: Shape): Cell[] {
  return (input.timings?.cells ?? input.scale.cells).filter(
    (c) => c.shape === shape,
  );
}

const sizesOf = (cells: readonly Cell[]) =>
  SIZES.filter((s) => cells.some((c) => c.size === s));
const libsOf = (cells: readonly Cell[]) =>
  LIBRARIES.filter((l) => cells.some((c) => c.library === l));

function row(
  t: ScaleTimingsFile,
  metric: ScaleTimingRow['metric'],
  library: string,
  shape: Shape,
  size: number,
): ScaleTimingRow | undefined {
  return t.results.find(
    (r) =>
      r.metric === metric &&
      r.library === library &&
      r.shape === shape &&
      r.size === size,
  );
}

/** The footnotes a table collects for its skipped cells. */
class Notes {
  readonly lines: string[] = [];
  mark(c: Cell): string {
    this.lines.push(
      `<sup>${this.lines.length + 1}</sup> ${c.library} at ${group(c.size)} providers: ${c.outcome}${c.message === undefined ? '' : ` (${c.message})`}`,
    );
    return `<sup>${this.lines.length}</sup>`;
  }
  text(): string {
    return this.lines.length === 0 ? '' : `\n\n${this.lines.join('  \n')}`;
  }
}

/** One cell of a per-size table: its figure, or why there is none. */
function figure(
  cell: Cell | undefined,
  notes: Notes,
  show: () => string | undefined,
): string {
  if (cell === undefined) return '-';
  if (cell.outcome === 'not-applicable') return 'n/a';
  if (cell.outcome !== 'pass') return `${cell.outcome}${notes.mark(cell)}`;
  return show() ?? '-';
}

const ratioText = (r: { median: number; low: number; high: number }) =>
  `${r.median.toFixed(2)} [${r.low.toFixed(2)}, ${r.high.toFixed(2)}]`;

/** The round counts and skipped libraries a shape's caption states. */
function caption(t: ScaleTimingsFile, shape: Shape, cells: Cell[]): string {
  const d = t.design['fresh-process'][shape];
  const rounds =
    d === undefined
      ? ''
      : `${group(d.measured)} measured rounds per size after ${group(d.warmup)} warm-up rounds`;
  const skipped = LIBRARIES.flatMap((l) => {
    const mine = cells.filter(
      (c) => c.library === l && c.outcome !== 'not-applicable',
    );
    const failed = mine.filter((c) => c.outcome !== 'pass');
    if (failed.length === 0) return [];
    const last = Math.max(
      ...mine.filter((c) => c.outcome === 'pass').map((c) => c.size),
    );
    return [last];
  });
  const skip =
    skipped.length === 0
      ? ''
      : `, ${skipped.length} ${skipped.length === 1 ? 'library' : 'libraries'} skipped above n = ${list([...new Set(skipped)].map(group))}`;
  return `${rounds}${skip}`;
}

/** The per-size table of one ratio metric for a shape. */
function metricTable(
  t: ScaleTimingsFile,
  metric: ScaleTimingRow['metric'],
  shape: Shape,
  cells: Cell[],
  show: (r: ScaleTimingRow) => string,
): string {
  const sizes = sizesOf(cells);
  const notes = new Notes();
  const rows = libsOf(cells).map((l) => [
    NAMES[l],
    ...sizes.map((s) =>
      figure(
        cells.find((c) => c.library === l && c.size === s),
        notes,
        () => {
          const r = row(t, metric, l, shape, s);
          if (r === undefined) return undefined;
          return r.vsNexus === undefined
            ? show(r)
            : `${show(r)}<br>${ratioText(r.vsNexus)}`;
        },
      ),
    ),
  ]);
  return `${table(['library', ...sizes.map(group)], rows)}${notes.text()}`;
}

const CREATE_WORK = table(
  ['library', '`create` does'],
  [
    [
      'NexusDI',
      '`await Nexus.create(App)`: compiles the blueprint, runs every validation pass and builds every singleton (eager by default)',
    ],
    [
      'InversifyJS',
      '`new Container()`, then `load` of every `ContainerModule` (`wide`: one `bind` per provider)',
    ],
    [
      'tsyringe',
      'nothing: `@singleton()` classes and `@registry` classes register on the global container at load',
    ],
    [
      'awilix',
      '`createContainer({ injectionMode: PROXY, strict: true })` and the `register<Module>` calls',
    ],
    [
      'needle-di',
      '`new Container()` and the `register<Module>` calls; `@injectable()` classes bind on first `get`',
    ],
  ],
);

function timingSections(t: ScaleTimingsFile, input: RenderInput): string[] {
  const out: string[] = [];
  const shapes = SHAPES.filter(
    (s) => t.design['fresh-process'][s] !== undefined,
  );
  for (const shape of shapes) {
    const cells = cellsOf(input, shape);
    out.push(
      `## Startup, ${shape}`,
      `Median startup in ms (load plus ready), and NexusDI's startup divided by the library's with its 95% interval; above 1 means NexusDI takes longer. ${caption(t, shape, cells)}.`,
      metricTable(
        t,
        'startup',
        shape,
        cells,
        (r) => `${ms(r.stats.median)} ms`,
      ),
    );
  }
  const mixed = cellsOf(input, 'mixed');
  if (t.design['fresh-process'].mixed !== undefined) {
    for (const [metric, title, what] of [
      [
        'first-resolve',
        'First resolve',
        'load, create and the first get: the time until the target is usable',
      ],
      [
        'ready',
        'Ready',
        'create, the first get and one get of every other provider',
      ],
    ] as const)
      out.push(
        `## ${title}, mixed`,
        `Median ${what}. ${caption(t, 'mixed', mixed)}.`,
        metricTable(
          t,
          metric,
          'mixed',
          mixed,
          (r) => `${ms(r.stats.median)} ms`,
        ),
      );
    out.push(
      '## Phases, mixed',
      'Absolute medians in ms per phase. NexusDI builds its singletons in `create` and the others build on `get`, so `create` and `first-get` compare different work. Relative statements on this page use first-resolve, ready and startup.',
    );
    for (const size of sizesOf(mixed)) {
      const notes = new Notes();
      const rows = libsOf(mixed).map((l) => [
        NAMES[l],
        ...(['load', 'create', 'first-get', 'rest'] as const).map((m) =>
          figure(
            mixed.find((c) => c.library === l && c.size === size),
            notes,
            () => {
              const r = row(t, m, l, 'mixed', size);
              return r === undefined ? undefined : ms(r.stats.median);
            },
          ),
        ),
      ]);
      out.push(
        `### ${group(size)} providers`,
        `${table(['library', 'load', 'create', 'first-get', 'rest'], rows)}${notes.text()}`,
      );
    }
    out.push('### What `create` does', CREATE_WORK);

    const growthStart = out.length;
    out.push(
      '## Local growth exponents',
      "The exponent between two adjacent sizes is log(R) / log(hi / lo), where R is the median over rounds of the same library's time at hi over its time at lo in the same round. The interval is the ratio's bootstrap interval through the same transform. A pair that touches a failed size has no figure. The last column is the marginal ns per provider between 1,000 and 5,000.",
    );
    for (const metric of ['startup', 'ready'] as const) {
      const sizes = sizesOf(mixed);
      const pairs = sizes.slice(1).map((hi, i) => [sizes[i] ?? 0, hi] as const);
      const marginal = t.marginal.some(
        (x) => x.metric === 'startup' && x.shape === 'mixed',
      );
      // A partial run has no pairs and no marginal: no data columns, no table.
      if (pairs.length === 0 && !(metric === 'startup' && marginal)) continue;
      const rows = libsOf(mixed).map((l) => [
        NAMES[l],
        ...pairs.map(([from, to]) => {
          const g = t.growth.find(
            (x) =>
              x.metric === metric &&
              x.library === l &&
              x.shape === 'mixed' &&
              x.from === from &&
              x.to === to,
          );
          return g === undefined
            ? '-'
            : `${g.exponent.toFixed(2)} [${g.low.toFixed(2)}, ${g.high.toFixed(2)}]`;
        }),
        ...(metric === 'startup'
          ? [
              ((): string => {
                const m = t.marginal.find(
                  (x) =>
                    x.metric === 'startup' &&
                    x.library === l &&
                    x.shape === 'mixed',
                );
                return m === undefined
                  ? '-'
                  : `${Math.round(m.perProvider)} ns`;
              })(),
            ]
          : []),
      ]);
      out.push(
        `### ${metric}`,
        table(
          [
            'library',
            ...pairs.map(([a, b]) => `${group(a)} to ${group(b)}`),
            ...(metric === 'startup' ? ['per provider'] : []),
          ],
          rows,
        ),
      );
    }

    if (out.length === growthStart + 2) out.length = growthStart;

    const heapNotes = new Notes();
    const sizes = sizesOf(mixed);
    out.push(
      '## Retained heap, mixed',
      `Heap retained after startup with the container referenced, in kB, minus the heap before the app loaded, and NexusDI's figure divided by the library's. The last column is the marginal bytes per provider between 1,000 and 5,000.`,
      `${table(
        ['library', ...sizes.map(group), 'per provider'],
        libsOf(mixed).map((l) => [
          NAMES[l],
          ...sizes.map((s) =>
            figure(
              mixed.find((c) => c.library === l && c.size === s),
              heapNotes,
              () => {
                const r = row(t, 'heap-ready', l, 'mixed', s);
                if (r === undefined) return undefined;
                const kb = `${(r.stats.median / 1000).toFixed(1)} kB`;
                return r.vsNexus === undefined
                  ? kb
                  : `${kb}<br>${ratioText(r.vsNexus)}`;
              },
            ),
          ),
          ((): string => {
            const m = t.marginal.find(
              (x) =>
                x.metric === 'heap-ready' &&
                x.library === l &&
                x.shape === 'mixed',
            );
            return m === undefined ? '-' : `${Math.round(m.perProvider)} B`;
          })(),
        ]),
      )}${heapNotes.text()}`,
    );
  }
  out.push(
    '## Run',
    [
      `- Run: ${t.sha} at ${t.startedAt}, seed ${t.seed}, graph seed ${t.graphSeed}`,
      `- Core ref: ${t.coreRef.ref}, libs/core tree ${t.coreRef.tree}`,
      `- Runner: ${t.runner.os}, ${t.runner.cpu}, ${t.runner.cores} cores, ${t.runner.memoryGb} GB${t.runner.hosted ? ', hosted' : ''}`,
      `- Versions: ${Object.entries(t.versions.libraries)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}, node ${t.versions.node}`,
    ].join('\n'),
  );
  return out;
}

function bundleSections(scale: ScaleFile): string[] {
  const sizes = SIZES.filter((s) => scale.sizes.some((r) => r.size === s));
  const libs = LIBRARIES.filter((l) =>
    scale.sizes.some((r) => r.library === l),
  );
  const out = [
    '## Bundle bytes, mixed',
    'esbuild with `--bundle --minify --format=esm`, library included, then gzip at level 9. The last column is (bytes at 5,000 minus bytes at 1,000) / 4,000: the marginal bytes of one more provider.',
  ];
  for (const bytes of ['gzip', 'minified'] as const)
    out.push(
      `### ${bytes}`,
      table(
        ['library', ...sizes.map(group), 'per provider'],
        libs.map((l) => [
          NAMES[l],
          ...sizes.map((s) => {
            const r = scale.sizes.find((x) => x.library === l && x.size === s);
            return r === undefined ? '-' : group(r[bytes]);
          }),
          (() => {
            const p = scale.perProvider.find(
              (x) => x.library === l && x.bytes === bytes,
            );
            return p === undefined ? '-' : `${p.perProvider.toFixed(2)} B`;
          })(),
        ]),
      ),
    );
  return out;
}

function graphSection(scale: ScaleFile): string[] {
  return [
    '## Graphs',
    `Generated from graph seed ${scale.graphSeed}. A graph's hash changes when the generator does.`,
    table(
      [
        'shape',
        'size',
        'hash',
        'providers',
        'edges',
        'modules',
        'depth',
        'mean fan-out',
        'max fan-out',
        'max fan-in',
        'kinds',
        'target closure',
      ],
      scale.graphs.map((g) => [
        g.shape,
        group(g.size),
        g.hash,
        group(g.providers),
        group(g.edges),
        String(g.modules),
        String(g.maxDepth),
        g.meanFanOut.toFixed(2),
        String(g.maxFanOut),
        String(g.maxFanIn),
        Object.entries(g.kinds)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${group(n)} ${k}`)
          .join(', '),
        String(g.targetClosure),
      ]),
    ),
  ];
}

/** A series per library for a chart, ending at the last passing size. */
function seriesOf(
  cells: readonly Cell[],
  point: (
    l: LibraryId,
    size: number,
  ) => { y: number; low?: number; high?: number } | undefined,
): ChartSeries[] {
  return libsOf([...cells]).flatMap((l) => {
    const mine = cells.filter((c) => c.library === l);
    const points = sizesOf(mine).flatMap((x) => {
      const p =
        mine.find((c) => c.size === x)?.outcome === 'pass'
          ? point(l, x)
          : undefined;
      return p === undefined ? [] : [{ x, ...p }];
    });
    if (points.length === 0) return [];
    const failed = mine
      .filter((c) => c.outcome !== 'pass' && c.outcome !== 'not-applicable')
      .sort((a, b) => a.size - b.size)[0];
    return [
      {
        id: l,
        label: NAMES[l],
        points,
        ...(failed === undefined
          ? {}
          : { end: { outcome: failed.outcome, size: failed.size } }),
      },
    ];
  });
}

function startupChart(t: ScaleTimingsFile, input: RenderInput): string {
  const cells = cellsOf(input, 'mixed');
  const d: ChartInput = {
    title: 'Startup against providers, mixed',
    desc: `Median startup in ms of each library on mixed graphs of ${list(sizesOf(cells).map(group))} providers, with the 5th to 95th percentile of each point. ${caption(t, 'mixed', cells)}.`,
    xLabel: 'providers',
    yLabel: 'startup (ms)',
    series: seriesOf(cells, (l, size) => {
      const r = row(t, 'startup', l, 'mixed', size);
      return r === undefined
        ? undefined
        : {
            y: r.stats.median / 1e6,
            low: r.stats.p5 / 1e6,
            high: r.stats.p95 / 1e6,
          };
    }),
  };
  return renderChart(d);
}

function bundleChart(scale: ScaleFile): string {
  const cells = scale.cells.filter((c) => c.shape === 'mixed');
  return renderChart({
    title: 'Bundle size against providers, mixed',
    desc: `Gzip bytes of each library's bundle on mixed graphs of ${list(sizesOf(cells).map(group))} providers.`,
    xLabel: 'providers',
    yLabel: 'gzip bytes',
    series: seriesOf(cells, (l, size) => {
      const r = scale.sizes.find((x) => x.library === l && x.size === size);
      return r === undefined ? undefined : { y: r.gzip };
    }),
  });
}

/** The section of results/README.md between the generated markers. */
function readmeSection(input: RenderInput): string {
  const { scale, timings } = input;
  const out = ['## Scaling', ''];
  if (timings !== undefined) {
    const cells = cellsOf(input, 'mixed');
    out.push(
      `Startup on \`mixed\` graphs. ${caption(timings, 'mixed', cells)}. The second line is NexusDI's startup divided by the library's, with its 95% interval; above 1 means NexusDI takes longer.`,
      '',
      metricTable(
        timings,
        'startup',
        'mixed',
        cells,
        (r) => `${ms(r.stats.median)} ms`,
      ),
      '',
      '![Startup against providers, mixed](scale-startup.svg)',
      '',
    );
  }
  const sizes = SIZES.filter((s) => scale.sizes.some((r) => r.size === s));
  out.push(
    'Gzip bytes of the bundle on `mixed` graphs.',
    '',
    table(
      ['library', ...sizes.map(group)],
      LIBRARIES.filter((l) => scale.sizes.some((r) => r.library === l)).map(
        (l) => [
          NAMES[l],
          ...sizes.map((s) => {
            const r = scale.sizes.find((x) => x.library === l && x.size === s);
            return r === undefined ? '-' : group(r.gzip);
          }),
        ],
      ),
    ),
    '',
    '![Bundle size against providers, mixed](scale-bundle.svg)',
    '',
    'Every table, with the other shapes, the phases and the growth exponents, is in [scale.md](scale.md).',
  );
  return out.join('\n');
}

export function renderAll(input: RenderInput): {
  files: Record<string, string>;
  readmeSection: string;
} {
  const { scale, timings } = input;
  const md = [
    '# Scale results',
    '',
    timings === undefined
      ? 'No timing run yet: this page holds the deterministic results from `scale.json` only.'
      : `Timings from run ${timings.sha}. Relative figures are NexusDI's divided by the library's, so a figure above 1 means NexusDI takes longer.`,
    '',
    ...(timings === undefined
      ? []
      : timingSections(timings, input).flatMap((p) => [p, ''])),
    ...bundleSections(scale).flatMap((p) => [p, '']),
    ...graphSection(scale).flatMap((p) => [p, '']),
  ]
    .join('\n')
    .replace(/\n+$/, '\n');
  const files: Record<string, string> = {
    'scale.md': md,
    'scale-bundle.svg': bundleChart(scale),
  };
  if (timings !== undefined)
    files['scale-startup.svg'] = startupChart(timings, input);
  return { files, readmeSection: readmeSection(input) };
}

/** What stops a render: the inputs disagree, so the page would mix two generators or two runs. */
export function problems(input: RenderInput): string[] {
  const { scale, timings } = input;
  if (timings === undefined) return [];
  const found: string[] = [];
  for (const g of timings.graphs) {
    const s = scale.graphs.find(
      (x) => x.shape === g.shape && x.size === g.size,
    );
    if (s !== undefined && s.hash !== g.hash)
      found.push(
        `graph ${g.shape} ${g.size}: the timing file has hash ${g.hash}, scale.json has ${s.hash}; the run was made with an older generator`,
      );
  }
  for (const c of timings.cells) {
    const s = scale.cells.find(
      (x) =>
        x.library === c.library &&
        x.variant === c.variant &&
        x.shape === c.shape &&
        x.size === c.size,
    );
    if (s !== undefined && s.outcome !== c.outcome)
      found.push(
        `${c.library}/${c.variant} ${c.shape} ${c.size}: the timing file records ${c.outcome}, scale.json records ${s.outcome}`,
      );
  }
  return found;
}

/** README with its generated section replaced, appended, or the file created. */
export function spliceSection(
  readme: string | undefined,
  section: string,
): string {
  const block = `${BEGIN}\n\n${section}\n\n${END}`;
  if (readme === undefined) return `# Benchmark results\n\n${block}\n`;
  const start = readme.indexOf(BEGIN);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1)
    return `${readme.replace(/\n*$/, '\n')}\n${block}\n`;
  return `${readme.slice(0, start)}${block}${readme.slice(end + END.length)}`;
}

/** results/, or the directory --results names (the tests render into a copy). */
const RESULTS = argValue('results') ?? join(BENCHMARKS, 'results');

/** The run with the latest startedAt; two runs of one day differ by their time, not their file name. */
function newestTimings(): ScaleTimingsFile | undefined {
  const dir = join(RESULTS, 'scale');
  if (!existsSync(dir)) return undefined;
  const runs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map(
      (f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ScaleTimingsFile,
    );
  return runs.sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  )[0];
}

if (import.meta.main) {
  const check = process.argv.includes('--check');
  const input: RenderInput = {
    scale: JSON.parse(
      readFileSync(join(RESULTS, 'scale.json'), 'utf8'),
    ) as ScaleFile,
    timings: newestTimings(),
  };
  const bad = problems(input);
  if (bad.length > 0) {
    console.error(`scale inputs disagree:\n  ${bad.join('\n  ')}`);
    process.exit(1);
  }
  const { files, readmeSection: section } = renderAll(input);
  const readmePath = join(RESULTS, 'README.md');
  const readme = spliceSection(
    existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : undefined,
    section,
  );
  const wanted: Record<string, string> = { ...files, 'README.md': readme };
  const stale = Object.entries(wanted)
    .filter(([name, text]) => {
      const path = join(RESULTS, name);
      return !existsSync(path) || readFileSync(path, 'utf8') !== text;
    })
    .map(([name]) => name);
  if (check) {
    if (stale.length > 0) {
      console.error(
        `stale: ${stale.join(', ')}. Run node src/scale/render.ts and commit.`,
      );
      process.exit(1);
    }
    console.log('scale render is current');
  } else {
    for (const [name, text] of Object.entries(wanted))
      writeFileSync(join(RESULTS, name), text);
    console.log(`Wrote ${Object.keys(wanted).join(', ')}`);
  }
}
