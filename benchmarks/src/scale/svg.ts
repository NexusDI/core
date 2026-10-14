/**
 * The scale suite's chart writer (scale spec section 9): a log-log line
 * chart as a string. One line per library through its points, a p5 to p95
 * bar at each point, decade ticks on both axes, the line's name at its right
 * end (no legend box), Okabe-Ito colors with a lighter blue on dark, a
 * `<title>` and `<desc>` for screen readers, and a `prefers-color-scheme`
 * block so the chart reads on GitHub in both themes. A library that failed
 * above some size ends at its last passing size with a cross there. No
 * dependency; the output is a pure function of the input.
 */
import { LIBRARIES } from '../schema.ts';

export interface ChartPoint {
  x: number;
  y: number;
  /** p5 and p95 of y, drawn as a vertical bar. */
  low?: number;
  high?: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  /** Ascending in x. A series that failed above some size stops at the last size that passed. */
  points: ChartPoint[];
  /** Set when the library failed at `size`: the line ends at its last point with a cross. */
  end?: { outcome: string; size: number };
}

export interface ChartInput {
  title: string;
  desc: string;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
}

const W = 720;
const H = 420;
const M = { left: 72, right: 120, top: 36, bottom: 56 };
const GAP = 15;

/** Okabe-Ito, one per library in schema order; a lighter blue on dark. */
const LIGHT = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00'];
const DARK = ['#56B4E9', '#E69F00', '#009E73', '#CC79A7', '#D55E00'];

/** The powers of ten that bound [min, max]: 50 to 5,000 gives 10, 100, 1,000, 10,000. */
export function decadeTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(min) + 1e-12);
  const hi = Math.ceil(Math.log10(max) - 1e-12);
  return Array.from(
    { length: Math.max(hi - lo, 1) + 1 },
    (_, i) => 10 ** (lo + i),
  );
}

const num = (n: number) => String(Math.round(n * 100) / 100);
const group = (n: number) => n.toLocaleString('en-US');
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colorIndex = (id: string, position: number) => {
  const known = (LIBRARIES as readonly string[]).indexOf(id);
  return (known === -1 ? position : known) % LIGHT.length;
};

export function renderChart(input: ChartInput): string {
  const all = input.series.flatMap((s) => s.points);
  const xs = decadeTicks(
    Math.min(...all.map((p) => p.x)),
    Math.max(...all.map((p) => p.x)),
  );
  const ys = decadeTicks(
    Math.min(...all.map((p) => p.low ?? p.y)),
    Math.max(...all.map((p) => p.high ?? p.y)),
  );
  const [x0, x1] = [xs[0] ?? 1, xs.at(-1) ?? 10];
  const [y0, y1] = [ys[0] ?? 1, ys.at(-1) ?? 10];
  const px = (x: number) =>
    M.left +
    ((Math.log10(x) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) *
      (W - M.left - M.right);
  const py = (y: number) =>
    H -
    M.bottom -
    ((Math.log10(y) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) *
      (H - M.top - M.bottom);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" font-family="system-ui, sans-serif" font-size="12">`,
    `<title>${esc(input.title)}</title>`,
    `<desc>${esc(input.desc)}</desc>`,
    '<style>',
    `svg{--bg:#ffffff;--ink:#1a1a19;--muted:#5f5f5b;--grid:#e3e3e0;${LIGHT.map((c, i) => `--c${i}:${c}`).join(';')}}`,
    `@media (prefers-color-scheme: dark){svg{--bg:#1a1a19;--ink:#ecece9;--muted:#a3a39e;--grid:#3a3a37;${DARK.map((c, i) => `--c${i}:${c}`).join(';')}}}`,
    '.bg{fill:var(--bg)}text{fill:var(--ink)}.muted{fill:var(--muted)}',
    '.grid{stroke:var(--grid);stroke-width:1}.line{fill:none;stroke-width:2}.range{stroke-width:1.5;opacity:.55}',
    '.dot{stroke:var(--bg);stroke-width:2}.end-marker path{fill:none;stroke-width:2.5}',
    ...LIGHT.map(
      (_, i) =>
        `.s${i}{stroke:var(--c${i});color:var(--c${i})}.dot.s${i}{fill:var(--c${i})}`,
    ),
    '</style>',
    `<rect class="bg" width="${W}" height="${H}"/>`,
  );

  for (const t of xs)
    out.push(
      `<line class="grid xtick" x1="${num(px(t))}" y1="${M.top}" x2="${num(px(t))}" y2="${H - M.bottom}"/>`,
      `<text class="muted" x="${num(px(t))}" y="${H - M.bottom + 18}" text-anchor="middle">${group(t)}</text>`,
    );
  for (const t of ys)
    out.push(
      `<line class="grid ytick" x1="${M.left}" y1="${num(py(t))}" x2="${W - M.right}" y2="${num(py(t))}"/>`,
      `<text class="muted" x="${M.left - 8}" y="${num(py(t) + 4)}" text-anchor="end">${group(t)}</text>`,
    );
  out.push(
    `<text class="muted" x="${num((M.left + W - M.right) / 2)}" y="${H - 10}" text-anchor="middle">${esc(input.xLabel)}</text>`,
    `<text class="muted" x="14" y="${num((M.top + H - M.bottom) / 2)}" text-anchor="middle" transform="rotate(-90 14 ${num((M.top + H - M.bottom) / 2)})">${esc(input.yLabel)}</text>`,
  );

  const labels: Array<{ y: number; x: number; text: string; cls: string }> = [];
  input.series.forEach((s, position) => {
    const cls = `s${colorIndex(s.id, position)}`;
    const id = esc(s.id);
    out.push(
      `<polyline class="line ${cls}" data-series="${id}" points="${s.points.map((p) => `${num(px(p.x))},${num(py(p.y))}`).join(' ')}"/>`,
    );
    for (const p of s.points) {
      if (p.low !== undefined && p.high !== undefined)
        out.push(
          `<line class="range ${cls}" data-series="${id}" data-n="${p.x}" x1="${num(px(p.x))}" y1="${num(py(p.low))}" x2="${num(px(p.x))}" y2="${num(py(p.high))}"/>`,
        );
      out.push(
        `<circle class="dot ${cls}" data-series="${id}" data-n="${p.x}" cx="${num(px(p.x))}" cy="${num(py(p.y))}" r="4"/>`,
      );
    }
    const last = s.points.at(-1);
    if (last === undefined) return;
    if (s.end !== undefined) {
      const [cx, cy] = [px(last.x), py(last.y)];
      out.push(
        `<g class="end-marker ${cls}" data-series="${id}" data-n="${last.x}"><title>${esc(s.label)} fails at ${group(s.end.size)}: ${esc(s.end.outcome)}</title><path d="M${num(cx + 8)},${num(cy - 5)}l10,10m0,-10l-10,10"/></g>`,
      );
    }
    labels.push({
      y: py(last.y),
      x: px(last.x) + (s.end === undefined ? 10 : 24),
      text: s.label,
      cls,
    });
  });

  // Right-end labels, pushed apart so two close lines stay readable.
  const placed = [...labels].sort((a, b) => a.y - b.y);
  placed.forEach((l, i) => {
    const above = placed[i - 1];
    if (above !== undefined && l.y - above.y < GAP) l.y = above.y + GAP;
  });
  for (const l of labels)
    out.push(
      `<text class="end-label" x="${num(l.x)}" y="${num(l.y + 4)}">${esc(l.text)}</text>`,
    );
  out.push('</svg>', '');
  return out.join('\n');
}
