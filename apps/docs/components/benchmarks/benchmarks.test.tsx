import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Figure } from './Figure';
import { formatBytes, formatDuration } from './format';
import { MeasuredWith } from './MeasuredWith';
import { PerformanceTable } from './PerformanceTable';
import { ProbeTable } from './ProbeTable';
import { ToolchainGrid } from './ToolchainGrid';

vi.mock('./data', async () => {
  const { buildBenchmarkData } = await import('../../tools/benchmark-data.mjs');
  const results = join(
    import.meta.dirname,
    '../../tools/__fixtures__/benchmark-results',
  );
  return {
    benchmarkData: buildBenchmarkData({
      results,
      libraries: JSON.parse(
        readFileSync(join(results, 'libraries.json'), 'utf8'),
      ).libraries,
      coreVersion: '0.4.0-rc.0',
      commitOf: (path: string) =>
        path.endsWith('size.json') ? 'abcdef1234567' : null,
    }),
  };
});

/** A cell's text without its tooltip. */
function visible(cell: Element): string {
  const copy = cell.cloneNode(true) as Element;
  copy.querySelectorAll('[role="tooltip"]').forEach((tip) => tip.remove());
  return copy.textContent ?? '';
}

describe('format', () => {
  it('writes bytes and durations with their unit', () => {
    expect(formatBytes(940)).toBe('940 B');
    expect(formatBytes(18991)).toBe('19.0 kB');
    expect(formatDuration(180)).toBe('180 ns');
    expect(formatDuration(21000)).toBe('21 µs');
    expect(formatDuration(43000000)).toBe('43 ms');
    expect(formatDuration(2.1e9)).toBe('2.1 s');
  });
});

describe('Figure', () => {
  it('renders a figure with its unit and the exact value', () => {
    const { container } = render(
      <Figure of="size.nexusdi.plain.esbuild.gzip" />,
    );
    expect(container.textContent).toBe('19.0 kB');
    expect(container.querySelector('data')?.getAttribute('value')).toBe(
      '18991',
    );
    expect(container.firstElementChild?.getAttribute('title')).toBe(
      '18,991 bytes',
    );
  });

  it('flags a noisy timing and reads an older run through run', () => {
    expect(
      render(<Figure of="timings.nexusdi.plain.ready.median" />).container
        .textContent,
    ).toBe('21 µsnoisy');
    expect(
      render(
        <Figure
          of="timings.nexusdi.plain.cold-start.median"
          run="2026-09-28-1111111"
        />,
      ).container.textContent,
    ).toBe('47 ms');
  });

  it('throws on a path the results do not hold, so the build fails', () => {
    expect(() => Figure({ of: 'size.nexusdi.plain.esbuild.brotli' })).toThrow(
      `<Figure of="size.nexusdi.plain.esbuild.brotli">: "size.nexusdi.plain.esbuild.brotli": benchmarks/results holds no 'size.nexusdi.plain.esbuild.brotli'.`,
    );
  });
});

describe('PerformanceTable', () => {
  it('renders the four columns of benchmarks spec section 5.6 per library', () => {
    render(<PerformanceTable />);
    const rows = screen
      .getAllByRole('row')
      .map((row) => [...row.querySelectorAll('th, td')].map(visible));
    expect(rows).toEqual([
      ['Library', 'Bundle size (min+gzip)', 'Startup', 'Resolve', 'Build time'],
      ['NexusDI plain', '19.0 kB', '43 ms', '180 ns', '410 ms (esbuild)'],
      ['tsyringe decorated', '9.8 kB', '52 ms', '640 nsnoisy', '4.2 s (tsc)'],
      [
        'needle-di decorated',
        '3.4 kB',
        '41 ms',
        'not measured: needle-di documents singletons only.',
        '400 ms (esbuild)',
      ],
    ]);
  });

  it('holds the spread, the polyfill share and the paired ratio in the tooltip', () => {
    render(<PerformanceTable libraries={['nexusdi', 'tsyringe']} />);
    const tips = screen
      .getAllByRole('tooltip', { hidden: true })
      .map((tip) => tip.textContent);
    expect(tips).toContain(
      'minified 31.0 kBdecorator metadata polyfill 2.9 kB of it',
    );
    expect(tips).toContain(
      'MAD 1.1 msp5 50 msp95 56 msNexusDI ÷ this: 0.83× (95% interval 0.82× to 0.84×)',
    );
    // next/link drops the trailing slash outside `next build`.
    expect(
      screen
        .getByRole('link', { name: 'How the benchmarks are measured' })
        .getAttribute('href'),
    ).toMatch(/^\/benchmark-method\/?$/);
  });
});

describe('ToolchainGrid', () => {
  it('renders each cell outcome and links the documented limitation', () => {
    render(<ToolchainGrid library="tsyringe" />);
    const row = screen.getByRole('row', { name: /tsyringe decorated/ });
    expect(row.textContent).toContain('wrong instance');
    expect(
      within(row).getByRole('link', { name: 'documented' }),
    ).toHaveProperty(
      'href',
      'https://esbuild.github.io/content-types/#no-type-system',
    );
  });
});

describe('ProbeTable', () => {
  it('says where each library reports each mistake, NexusDI beside the one named', () => {
    render(<ProbeTable library="tsyringe" />);
    const row = screen.getByRole('row', {
      name: /A missing provider and a cycle together/,
    });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'container creation, names 2 of 2',
      'first resolve, names 1 of 2',
    ]);
    expect(
      screen.queryByRole('columnheader', { name: 'needle-di' }),
    ).toBeNull();
  });
});

describe('MeasuredWith', () => {
  it('names the runner and links a committed results file at its commit', () => {
    const { container } = render(<MeasuredWith />);
    expect(container.textContent).toContain('Fixture CPU, 4 cores, 16 GB');
    expect(container.textContent).toContain(
      'tsyringe 4.10.0 with a decorator metadata polyfill',
    );
    expect(container.textContent).not.toContain('metadata-polyfill@');
    expect(
      screen.getByRole('link', { name: 'size.json at abcdef1' }),
    ).toHaveProperty(
      'href',
      'https://github.com/NexusDI/core/blob/abcdef1234567/benchmarks/results/size.json',
    );
  });
});
