// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandDiagrams } from '../../tools/mdx-diagram-loader.mjs';
import { property, recolour, sentinel } from './palette';

const CONTENT = join(import.meta.dirname, '../../content');
const FENCE = /^```mermaid([^\n]*)\n([\s\S]*?)^```/gm;
const fence = '```';

/** Every `.mdx` file under a directory. */
function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return entry.name.endsWith('.mdx') ? [path] : [];
  });
}

/** Every Mermaid fence on the site, plus a fixture so the palette check always runs. */
function charts(): { page: string; chart: string }[] {
  const site = mdxFiles(CONTENT).flatMap((page) =>
    [...readFileSync(page, 'utf8').matchAll(FENCE)].map((match) => ({
      page,
      chart: match[2] as string,
    })),
  );
  return [
    ...site,
    {
      page: 'fixture',
      chart:
        'flowchart TD\n  Tactical --> Engineering\n  ShipComputer --> ReactorCore:::accent\n',
    },
  ];
}

describe('diagrams', () => {
  it('marks exactly one node of every chart as the accent', () => {
    for (const { page, chart } of charts()) {
      expect(chart.match(/:::accent\b/g), page).toHaveLength(1);
    }
  });

  it('lets a chart carry no colour of its own', () => {
    for (const { page, chart } of charts()) {
      expect(chart, page).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(chart, page).not.toMatch(/%%\{\s*init/);
      expect(chart, page).not.toMatch(/\b(?:style|classDef|linkStyle)\b/);
    }
  });

  it('rewrites a captioned mermaid fence into a Diagram and leaves the rest', () => {
    const chart = 'flowchart TD\n  Tactical --> Engineering:::accent';
    const source = [
      `${fence}mermaid caption="Tactical imports Engineering."`,
      chart,
      fence,
      '',
      `${fence}ts no-run`,
      'ship.get(NAV_CHARTS);',
      fence,
      '',
    ].join('\n');
    const out = expandDiagrams(source);
    expect(out).toContain(
      `<Diagram chart={${JSON.stringify(chart)}} caption={"Tactical imports Engineering."} />`,
    );
    expect(out).not.toContain('mermaid');
    expect(out).toContain(`${fence}ts no-run\nship.get(NAV_CHARTS);\n${fence}`);
  });

  it('throws on a mermaid fence with no caption, naming its line', () => {
    const source = `# Title\n\n${fence}mermaid\nflowchart TD\n  A --> B\n${fence}\n`;
    expect(() => expandDiagrams(source)).toThrow(/line 3.*caption/);
    expect(() =>
      expandDiagrams(`${fence}mermaid caption=""\nflowchart TD\n${fence}\n`),
    ).toThrow(/caption/);
  });

  it('throws when a caption holds a quote or a backslash', () => {
    const source = `# T\n\n${fence}mermaid caption="The \\"ship\\" flies."\nflowchart TD\n${fence}\n`;
    expect(() => expandDiagrams(source)).toThrow(/line 3.*quote/);
  });

  it('turns every sentinel colour in an SVG into its property', () => {
    const hexes = Object.values(sentinel);
    expect(new Set(hexes.map((hex) => hex.toLowerCase())).size).toBe(
      hexes.length,
    );
    const svg = Object.values(sentinel)
      .map((hex, index) =>
        index % 2 ? `fill="${hex.toUpperCase()}"` : `stroke:${hex};`,
      )
      .join(' ');
    const out = recolour(`${svg} fill="#123456"`);
    for (const value of Object.values(property)) expect(out).toContain(value);
    for (const hex of hexes) expect(out.toLowerCase()).not.toContain(hex);
    expect(out).toContain('fill="#123456"');
  });

  it('binds the sentinels to the Meridian properties', () => {
    expect(Object.values(property)).toEqual([
      'var(--meridian-ground-0)',
      'var(--meridian-hull)',
      'var(--meridian-rule)',
      'var(--meridian-text)',
      'var(--meridian-text-secondary)',
      'var(--meridian-signal-cyan)',
    ]);
  });
});
