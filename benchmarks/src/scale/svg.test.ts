import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { decadeTicks, renderChart, type ChartInput } from './svg.ts';

const GOLDEN = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  '__test__',
  'scale-chart.svg',
);

const pt = (x: number, y: number) => ({ x, y, low: y * 0.9, high: y * 1.2 });
/** Two libraries on the four sizes, one flat, one rising. */
const input: ChartInput = {
  title: 'Startup against providers',
  desc: 'Median startup of two libraries on mixed graphs of 50 to 5,000 providers.',
  xLabel: 'providers',
  yLabel: 'startup (ms)',
  series: [
    {
      id: 'nexusdi',
      label: 'NexusDI',
      points: [pt(50, 4), pt(200, 5), pt(1000, 9), pt(5000, 30)],
    },
    {
      id: 'tsyringe',
      label: 'tsyringe',
      points: [pt(50, 3), pt(200, 3.5), pt(1000, 5), pt(5000, 14)],
    },
  ],
};

// jsdom ships no types here; the XML parser throws on malformed markup.
interface El {
  nodeName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): El | null;
}
interface Doc {
  documentElement: El;
  querySelector(selector: string): El | null;
  querySelectorAll(selector: string): ArrayLike<El> & Iterable<El>;
}
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (
    markup: string,
    options: { contentType: string },
  ) => { window: { document: Doc } };
};
const parse = (svg: string) =>
  new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;

describe('decadeTicks', () => {
  it('gives 10, 100, 1,000 and 10,000 for 50 to 5,000', () => {
    expect(decadeTicks(50, 5000)).toEqual([10, 100, 1000, 10000]);
  });
  it('keeps a range inside one decade to its two bounding decades', () => {
    expect(decadeTicks(200, 800)).toEqual([100, 1000]);
  });
  it('includes an exact power of ten at either end once', () => {
    expect(decadeTicks(100, 1000)).toEqual([100, 1000]);
  });
});

describe('renderChart', () => {
  it('parses as XML', () => {
    const doc = parse(renderChart(input));
    expect(doc.documentElement.nodeName).toBe('svg');
  });

  it('puts n = 1,000 at two thirds of the plot between the 10 and 10,000 ticks', () => {
    const doc = parse(renderChart(input));
    const ticks = [...doc.querySelectorAll('line.xtick')].map((t) =>
      Number(t.getAttribute('x1')),
    );
    const x = (n: number) =>
      Number(
        doc
          .querySelector(`circle[data-series="nexusdi"][data-n="${n}"]`)
          ?.getAttribute('cx'),
      );
    const [first, last] = [ticks[0] ?? NaN, ticks.at(-1) ?? NaN];
    expect(ticks).toHaveLength(4);
    // log10: 1 -> 4 over the ticks, 1,000 is at 3, two thirds of the way.
    // Coordinates are written to 0.01, so compare to 0.05.
    expect(x(1000)).toBeCloseTo(first + ((last - first) * 2) / 3, 1);
    expect(x(50)).toBeLessThan(x(1000));
  });

  it('labels each line at its right end, with no legend box', () => {
    const doc = parse(renderChart(input));
    const labels = [...doc.querySelectorAll('text.end-label')].map(
      (t) => t.textContent,
    );
    expect(labels).toEqual(['NexusDI', 'tsyringe']);
    expect(doc.querySelector('.legend')).toBeNull();
  });

  describe('end labels that converge', () => {
    // Both lines end at the same height, so the second label is pushed down.
    const converged: ChartInput = {
      ...input,
      series: [
        { id: 'nexusdi', label: 'NexusDI', points: [pt(50, 4), pt(5000, 10)] },
        {
          id: 'tsyringe',
          label: 'tsyringe',
          points: [pt(50, 3), pt(5000, 10)],
        },
        { id: 'awilix', label: 'awilix', points: [pt(50, 2), pt(5000, 2)] },
      ],
    };
    const doc = () => parse(renderChart(converged));

    it('gives every label a 12 px swatch in its line colour', () => {
      const d = doc();
      const swatches = [...d.querySelectorAll('line.swatch')];
      expect(swatches).toHaveLength(3);
      for (const w of swatches)
        expect(
          Number(w.getAttribute('x2')) - Number(w.getAttribute('x1')),
        ).toBe(12);
      const cls = (sel: string) => d.querySelector(sel)?.getAttribute('class');
      for (const id of ['nexusdi', 'tsyringe', 'awilix'])
        expect(cls(`line.swatch[data-series="${id}"]`)).toContain(
          cls(`polyline[data-series="${id}"]`)?.split(' ')[1],
        );
    });

    it('draws a 1 px leader from the line end to a label that was pushed', () => {
      const d = doc();
      const leaders = [...d.querySelectorAll('line.leader')];
      expect(leaders.map((l) => l.getAttribute('data-series'))).toEqual([
        'tsyringe',
      ]);
      const end = d.querySelector(
        'circle[data-series="tsyringe"][data-n="5000"]',
      );
      expect(leaders[0]?.getAttribute('x1')).toBe(end?.getAttribute('cx'));
      expect(leaders[0]?.getAttribute('y1')).toBe(end?.getAttribute('cy'));
      expect(Number(leaders[0]?.getAttribute('y2'))).toBeGreaterThan(
        Number(end?.getAttribute('cy')),
      );
    });

    it('draws no leader for labels that stay at their line end', () => {
      const d = parse(renderChart(input));
      expect(d.querySelectorAll('line.leader')).toHaveLength(0);
      expect(d.querySelectorAll('line.swatch')).toHaveLength(2);
    });
  });

  it('keeps a library colour whether it is alone or after NexusDI', () => {
    const colour = (svg: string) =>
      parse(svg)
        .querySelector('polyline[data-series="tsyringe"]')
        ?.getAttribute('class');
    const [nexus, tsyringe] = input.series as [
      ChartInput['series'][number],
      ChartInput['series'][number],
    ];
    expect(colour(renderChart({ ...input, series: [tsyringe] }))).toBe(
      colour(renderChart({ ...input, series: [nexus, tsyringe] })),
    );
  });

  it('names the chart for screen readers and carries a dark-mode block', () => {
    const svg = renderChart(input);
    const doc = parse(svg);
    expect(doc.querySelector('title')?.textContent).toBe(input.title);
    expect(doc.querySelector('desc')?.textContent).toBe(input.desc);
    expect(svg).toMatch(/prefers-color-scheme:\s*dark/);
  });

  it('draws a p5 to p95 bar at each point that has one', () => {
    const doc = parse(renderChart(input));
    expect(
      doc.querySelectorAll('line.range[data-series="nexusdi"]'),
    ).toHaveLength(4);
  });

  it('ends a skipped cell at its last passing size with an end marker', () => {
    const skipped: ChartInput = {
      ...input,
      series: [
        input.series[0] as ChartInput['series'][number],
        {
          id: 'tsyringe',
          label: 'tsyringe',
          points: [pt(50, 3), pt(200, 3.5)],
          end: { outcome: 'runtime-error', size: 1000 },
        },
      ],
    };
    const doc = parse(renderChart(skipped));
    const dots = doc.querySelectorAll('circle[data-series="tsyringe"]');
    expect([...dots].map((d) => d.getAttribute('data-n'))).toEqual([
      '50',
      '200',
    ]);
    const marker = doc.querySelector('.end-marker[data-series="tsyringe"]');
    expect(marker?.getAttribute('data-n')).toBe('200');
    expect(marker?.querySelector('title')?.textContent).toMatch(
      /tsyringe.*1,000.*runtime-error/,
    );
    expect(
      doc.querySelectorAll('.end-marker[data-series="nexusdi"]'),
    ).toHaveLength(0);
  });

  it('escapes markup in names', () => {
    const svg = renderChart({
      ...input,
      title: 'a < b & c',
      series: [{ id: 'x', label: '<x>', points: [pt(50, 1), pt(200, 2)] }],
    });
    expect(parse(svg).querySelector('title')?.textContent).toBe('a < b & c');
  });

  it('is deterministic and matches the committed file', () => {
    const svg = renderChart(input);
    expect(renderChart(input)).toBe(svg);
    expect(svg).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});
