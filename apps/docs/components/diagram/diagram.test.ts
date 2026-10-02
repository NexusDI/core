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
    expect(out).not.toContain('#123456');
  });

  it('mixes a sentinel with an alpha and neutralises the colours Mermaid fixes', () => {
    const [r, g, b] = [1, 3, 5].map((at) =>
      Number.parseInt(sentinel.page.slice(at, at + 2), 16),
    );
    const out = recolour(
      [
        `.labelBkg{background-color:rgba(${r}, ${g}, ${b}, 0.5);}`,
        '.arrowheadPath{fill:#fef5f4;}',
        'filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));',
        'flood-color="#000000"',
        'a &#160; b url(#nexus-diagram-x-gradient)',
      ].join(' '),
    );
    expect(out).toContain(
      'background-color:color-mix(in srgb, var(--meridian-ground-0) 50%, transparent);',
    );
    expect(out).toContain('.arrowheadPath{fill:currentColor;}');
    expect(out).toContain('flood-color="currentColor"');
    expect(out).not.toMatch(/#[0-9a-f]{6}|rgba?\(/i);
    expect(out).toContain('&#160;');
    expect(out).toContain('url(#nexus-diagram-x-gradient)');
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
