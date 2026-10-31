import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');

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

  it('carries no literal colour and reads only --meridian- properties', () => {
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []).toEqual([]);
    const reads = [...body.matchAll(/var\((--[\w-]+)/g)].map(
      (match) => match[1] ?? '',
    );
    expect(reads.filter((name) => !name.startsWith('--meridian-'))).toEqual([]);
  });
});
