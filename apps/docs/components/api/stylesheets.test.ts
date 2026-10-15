// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The API entry sheets take every value from a token, so they switch with the
 * theme and the design system holds their contrast.
 *
 * `public/code-classes.css` is left out: `docs:behaviour-data` writes it,
 * and its rules are the github themes' colour pairs as `--shiki-*` values.
 */

const SHEETS = [
  'api.css',
  'entry.css',
  'catalogue.css',
  'behaviour.css',
  'token-colours.css',
] as const;

const read = (name: string): string =>
  readFileSync(join(import.meta.dirname, name), 'utf8');

/** A sheet with its comments taken out, so prose naming a colour is no rule. */
const rules = (name: string): string =>
  read(name).replace(/\/\*[\s\S]*?\*\//g, '');

describe('the API entry sheets', () => {
  it.each(SHEETS)('%s writes no literal colour', (name) => {
    expect(rules(name).match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)).toBeNull();
  });

  it.each(SHEETS)(
    '%s reads only Meridian, shiki and Nextra properties',
    (name) => {
      const read = [...rules(name).matchAll(/var\((--[\w-]+)/g)].map(
        ([, property]) => property,
      );

      expect(read.length).toBeGreaterThan(0);
      expect(
        read.filter(
          (property) => !/^--(meridian|shiki|nextra)-/.test(property ?? ''),
        ),
      ).toEqual([]);
    },
  );

  it('switches a case token and a type card token between the two shiki themes, weight and style included', () => {
    const sheet = rules('token-colours.css');
    expect(sheet).toContain('.nexus-behaviours__body :where(span)');
    expect(sheet).toContain('.nexus-type-card :where(span)');
    const dark = /html\.dark[^{]*\{([^}]*)\}/.exec(sheet)?.[1] ?? '';

    expect(sheet).toContain('var(--shiki-light)');
    expect(sheet).toContain('var(--shiki-light-font-weight, inherit)');
    expect(sheet).toContain('var(--shiki-light-font-style, inherit)');
    expect(dark).toContain('var(--shiki-dark)');
    expect(dark).toContain('var(--shiki-dark-font-weight, inherit)');
    expect(dark).toContain('var(--shiki-dark-font-style, inherit)');
  });

  it('marks an off kind toggle without its hue', () => {
    expect(rules('api.css')).toMatch(
      /\[aria-pressed='false'\][^{]*\{[^}]*(line-through|dashed)/,
    );
  });
});
