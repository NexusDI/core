import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderTokensCss } from './tokens/custom-properties.js';

const GENERATED = join(import.meta.dirname, 'tokens.generated.css');

describe('src/tokens.generated.css', () => {
  it('is what the generator produces, byte for byte', () => {
    expect(
      readFileSync(GENERATED, 'utf8'),
      'src/tokens.generated.css differs from tools/generate-tokens.ts output. ' +
        'Run `npx nx run @nexusdi/meridian-ui:generate-tokens`. The token ' +
        'modules are the source; edit them and regenerate.',
    ).toBe(renderTokensCss());
  });
});

describe('renderTokensCss', () => {
  const css = renderTokensCss();

  it('binds the dark roles on html.dark and the light roles on the root', () => {
    expect(css).toContain(':root,\nhtml {');
    expect(css).toContain('html.dark {');
    expect(css).toMatch(/html\.dark \{[^}]*--meridian-text: #e8ecf0;/);
    expect(css).toMatch(/:root,\nhtml \{[^}]*--meridian-text: #11161c;/);
    expect(css).toMatch(/html\.dark \{[^}]*--meridian-bulkhead: #14191f;/);
    expect(css).toMatch(/:root,\nhtml \{[^}]*--meridian-bulkhead: #eceef1;/);
  });

  it('binds the screen roles once, for both themes', () => {
    expect(css).toMatch(/:root \{[^}]*--meridian-screen: #0b1015;/);
    expect(css).toMatch(/:root \{[^}]*--meridian-screen-text: #e8ecf0;/);
    expect(css).toMatch(/:root \{[^}]*--meridian-space: #070b12;/);
    expect(css).toMatch(
      /:root \{[^}]*--meridian-holo-backing: rgb\(14 42 51 \/ 0\.94\);/,
    );
  });

  it('writes the plate elevation per theme', () => {
    expect(css).toMatch(
      /html\.dark \{[^}]*--meridian-elevation-plate: 0 8px 20px -12px rgb\(0 0 0 \/ 0\.6\);/,
    );
    expect(css).toMatch(
      /:root,\nhtml \{[^}]*--meridian-elevation-plate: 0 8px 20px -12px rgb\(0 0 0 \/ 0\.18\);/,
    );
  });

  it('carries the condensed family, the placard and readout tokens and four motion tiers', () => {
    expect(css).toContain('--meridian-font-condensed:');
    expect(css).toContain('--meridian-text-placard: 0.875rem;');
    expect(css).toContain('--meridian-text-readout: 1.563rem;');
    expect(css).toContain('--meridian-motion-sequence-step: 120ms;');
    expect(css).toContain('--meridian-motion-ambient-max: 240s;');
    expect(css).not.toContain('--meridian-tracking-micro');
  });

  it('removes the superseded roles', () => {
    expect(css).not.toMatch(/signal|status-pass|status-fail|nebula|hull/);
  });

  it('sets every duration to 0ms under reduced motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{[^}]*--meridian-motion-interaction: 0ms;[^}]*--meridian-motion-console: 0ms;[^}]*--meridian-motion-sequence-step: 0ms;/,
    );
  });

  it('emits only --meridian- properties', () => {
    const names = [...css.matchAll(/^\s*(--[\w-]+):/gm)].map(
      (match) => match[1],
    );
    expect(names.length).toBeGreaterThan(60);
    expect(names.filter((name) => !name!.startsWith('--meridian-'))).toEqual(
      [],
    );
  });
});
