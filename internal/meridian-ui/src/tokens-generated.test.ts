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
    expect(css).toMatch(/html\.dark \{[^}]*--meridian-text: #e8edff;/);
    expect(css).toMatch(/:root,\nhtml \{[^}]*--meridian-text: #0b1030;/);
  });

  it('writes the surfaces with their opacity', () => {
    expect(css).toMatch(
      /html\.dark \{[^}]*--meridian-hull: rgb\(11 16 48 \/ 0\.86\);/,
    );
    expect(css).toMatch(
      /:root,\nhtml \{[^}]*--meridian-hull: rgb\(255 255 255 \/ 0\.92\);/,
    );
  });

  it('sets every duration to 0ms under reduced motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{[^}]*--meridian-motion-interaction: 0ms;[^}]*--meridian-motion-console: 0ms;/,
    );
  });

  it('binds --meridian-kind per export-kind class', () => {
    expect(css).toContain(
      '.meridian-kind-type-alias {\n  --meridian-kind: var(--meridian-kind-type-alias);\n}',
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
