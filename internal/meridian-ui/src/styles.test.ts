import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');
const schematic = readFileSync(
  join(import.meta.dirname, 'schematic.css'),
  'utf8',
);

describe('src/styles.css', () => {
  it('imports the generated tokens first', () => {
    expect(source).toMatch(
      /^(\/\*[\s\S]*?\*\/\s*)?@import '\.\/tokens\.generated\.css';/,
    );
  });

  it('gives a chip no hue: a neutral colour on a seam border', () => {
    const rule = /\.meridian-chip \{([^}]*)\}/.exec(source);
    expect(rule?.[1]).toContain('color: var(--meridian-text-secondary)');
    expect(rule?.[1]).toContain('border: 1px solid var(--meridian-seam)');
    expect(source).not.toContain('--meridian-kind');
  });

  it('sets no uppercase and no tracking on a label', () => {
    expect(source).not.toContain('text-transform: uppercase');
    expect(source).not.toContain('--meridian-tracking-micro');
  });

  it('draws no CRT effect and no glass', () => {
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/backdrop-filter|text-shadow|scanline|vignette/);
  });

  it('lets only the pulsing ::after draw the alarm banner border', () => {
    expect(source).toMatch(
      /\.meridian-alert--alarm \{[^}]*border-color: transparent;/,
    );
  });

  it('keeps the lifetime shapes in forced colors', () => {
    expect(source).toMatch(
      /@media \(forced-colors: active\) \{[\s\S]*\.meridian-marker--lifetime \{[^}]*forced-color-adjust: none;[^}]*color: CanvasText;/,
    );
  });

  it('opens the log at its end with a reversed column and no scroll anchor', () => {
    expect(source).toMatch(
      /\.meridian-terminal__log \{[^}]*flex-direction: column-reverse;/,
    );
    expect(source).not.toContain('overflow-anchor');
  });

  it('draws the focus ring on the button and the log', () => {
    expect(source).toMatch(
      /\.meridian-button:focus-visible,\s*\.meridian-terminal__log:focus-visible \{[^}]*outline: 2px solid var\(--meridian-focus\);/,
    );
  });

  it('colours the values inside a terminal message with data', () => {
    expect(source).toMatch(
      /\.meridian-terminal__message :where\(data, var, \.meridian-terminal__value\) \{[^}]*color: var\(--meridian-data\);/,
    );
  });

  it('defines the classes of the five new components', () => {
    for (const name of [
      'meridian-terminal',
      'meridian-button',
      'meridian-status',
      'meridian-alert',
      'meridian-holo',
    ]) {
      expect(source).toContain(`.${name}`);
    }
  });

  it('keeps the schematic, hull crop, switch and step list out of the global sheet', () => {
    // Only the dark screen scope names the schematic, in one selector.
    expect(
      source.match(/\.meridian-(schematic|hull-crop|switch|steps)/g),
    ).toEqual(['.meridian-schematic']);
    for (const name of ['schematic', 'hull-crop', 'switch', 'steps']) {
      expect(schematic).toContain(`.meridian-${name}`);
    }
  });

  it('reads the art colours only inside the schematic rules', () => {
    const outside = (css: string) =>
      css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/(?<=\})\s*(?=[^{}]+\{)/)
        .filter(
          (rule) =>
            /--meridian-(hull-paint|lamp)\b/.test(rule) &&
            !/^\s*\.meridian-schematic\b/.test(rule),
        );
    expect(outside(source)).toEqual([]);
    expect(outside(schematic)).toEqual([]);
  });

  it('puts the schematic in the dark screen scope', () => {
    expect(source).toMatch(
      /\.meridian-holo,\s*\.meridian-schematic \{[^}]*--meridian-text: var\(--meridian-palette-dark-text\)/,
    );
  });

  it.each([
    ['styles.css', source],
    ['schematic.css', schematic],
  ])(
    'carries no literal colour in %s and reads only --meridian- properties',
    (_name, css) => {
      const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(body.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []).toEqual([]);
      const reads = [...body.matchAll(/var\((--[\w-]+)/g)].map(
        (match) => match[1] ?? '',
      );
      expect(reads.filter((name) => !name.startsWith('--meridian-'))).toEqual(
        [],
      );
    },
  );

  describe('the painted schematic', () => {
    const painted =
      /\.meridian-schematic--painted \{([^}]*)\}/.exec(schematic)?.[1] ?? '';

    it('draws nothing for a room, fixture or open door with no state', () => {
      expect(painted).toContain('--meridian-sv-room: transparent;');
      expect(painted).toContain('--meridian-sv-fixture: transparent;');
      expect(painted).toContain('--meridian-sv-door: transparent;');
    });

    it('lights a powered room with the lamp at 12%', () => {
      expect(painted).toMatch(
        /--meridian-sv-room-powered: color-mix\(\s*in srgb,\s*var\(--meridian-lamp\) 12%,\s*transparent\s*\);/,
      );
    });

    it('dims an unpowered room with a scrim of about 60% screen', () => {
      expect(painted).toMatch(
        /--meridian-sv-room-unpowered: color-mix\(\s*in srgb,\s*var\(--meridian-screen\) 60%,\s*transparent\s*\);/,
      );
      expect(schematic).toMatch(
        /--meridian-sv-room-unpowered: var\(--meridian-sv-room\);/,
      );
    });

    it('tints an alarm and outlines it with a dashed 2px stroke that does not scale', () => {
      expect(painted).toMatch(
        /--meridian-sv-room-alarm: color-mix\(\s*in srgb,\s*var\(--meridian-alarm\)/,
      );
      expect(painted).toContain('--meridian-sv-outline-width: 2px;');
      expect(painted).toContain('--meridian-sv-outline-dash: 6px 3px;');
      expect(painted).toContain(
        '--meridian-sv-outline-effect: non-scaling-stroke;',
      );
    });

    it('gives an offline fixture a scrim at full opacity, and hides the hull', () => {
      expect(painted).toMatch(/--meridian-sv-fixture-offline: color-mix\(/);
      expect(painted).toContain('--meridian-sv-offline-opacity: 1;');
      expect(schematic).toMatch(
        /\.meridian-schematic--painted \.sv-hull \{\s*display: none;/,
      );
    });
  });
});
