import { describe, expect, it } from 'vitest';

import { RegionError, parseRegions, readRegion } from '@nexusdi/doc-examples';

/**
 * Named regions are what the docs app renders instead of its own copy of an
 * example. Every malformed case throws, because the alternative is a docs page
 * quietly rendering something other than what the README ships.
 */

const fence = '```';

const source = [
  '# Luhn',
  '',
  '<!-- #region quick-start -->',
  `${fence}ts @import.meta.vitest`,
  "const { checksum } = Luhn.generate('foo');",
  "expect(checksum).toEqual('5');",
  fence,
  '<!-- #endregion quick-start -->',
  '',
  'Prose.',
  '',
  '<!-- #region hex -->',
  `${fence}ts`,
  "createLuhn({ dictionary: '0123456789abcdef' });",
  fence,
  '<!-- #endregion hex -->',
].join('\n');

describe('parseRegions', () => {
  it('finds every region', () => {
    expect([...parseRegions(source, 'README.md').keys()]).toEqual([
      'quick-start',
      'hex',
    ]);
  });

  it('returns the code without the fences', () => {
    expect(parseRegions(source, 'README.md').get('quick-start')?.code).toBe(
      "const { checksum } = Luhn.generate('foo');\nexpect(checksum).toEqual('5');",
    );
  });

  it('strips the doctest marker from the language', () => {
    expect(parseRegions(source, 'README.md').get('quick-start')?.lang).toBe(
      'ts',
    );
  });

  it('ignores prose outside any region', () => {
    expect(parseRegions(source, 'README.md').size).toBe(2);
  });

  it('rejects a region wrapping no code block', () => {
    const empty = [
      '<!-- #region x -->',
      'just prose',
      '<!-- #endregion x -->',
    ].join('\n');

    expect(() => parseRegions(empty, 'README.md')).toThrow(
      /expected exactly 1/,
    );
  });

  it('rejects a region wrapping two code blocks', () => {
    const two = [
      '<!-- #region x -->',
      `${fence}ts`,
      'a();',
      fence,
      `${fence}ts`,
      'b();',
      fence,
      '<!-- #endregion x -->',
    ].join('\n');

    expect(() => parseRegions(two, 'README.md')).toThrow(/expected exactly 1/);
  });

  it('rejects a region that is never closed', () => {
    const open = ['<!-- #region x -->', `${fence}ts`, 'a();', fence].join('\n');

    expect(() => parseRegions(open, 'README.md')).toThrow(/never closed/);
  });

  it('rejects a mismatched #endregion name', () => {
    const crossed = [
      '<!-- #region x -->',
      `${fence}ts`,
      'a();',
      fence,
      '<!-- #endregion y -->',
    ].join('\n');

    expect(() => parseRegions(crossed, 'README.md')).toThrow(RegionError);
  });

  it('rejects a duplicate region name', () => {
    const twice = [
      '<!-- #region x -->',
      `${fence}ts`,
      'a();',
      fence,
      '<!-- #endregion x -->',
      '<!-- #region x -->',
      `${fence}ts`,
      'b();',
      fence,
      '<!-- #endregion x -->',
    ].join('\n');

    expect(() => parseRegions(twice, 'README.md')).toThrow(/defined twice/);
  });
});

/**
 * Decision 17 of `docs/specs/2026-09-16-documentation-standard.md`: a region in
 * a `.ts` or `.tsx` source, so a type-level claim asserted in a `*.test-d.ts`
 * file can be the example a page renders.
 *
 * The markers are line comments and the extension picks them, so one
 * `parseRegions` serves both and a page's `file=` reference says which by
 * naming the file.
 *
 * An `.astro` component is two languages in one file, so it takes the line
 * comment in its frontmatter and the JSX expression comment in its template.
 */
const typeClaims = [
  "import { expectTypeOf } from 'vitest';",
  '',
  "describe('widen', () => {",
  '  // #region widen',
  '  expectTypeOf(widen(listing)).toEqualTypeOf<Listing>();',
  '',
  '  // @ts-expect-error -- a draft has no price',
  '  widen(draft).price;',
  '  // #endregion widen',
  '});',
].join('\n');

describe('parseRegions in a source file', () => {
  it('reads the lines between the markers, without the block indent', () => {
    expect(parseRegions(typeClaims, 'compose.test-d.ts').get('widen')?.code)
      .toBe(`expectTypeOf(widen(listing)).toEqualTypeOf<Listing>();

// @ts-expect-error -- a draft has no price
widen(draft).price;`);
  });

  it('takes the language from the extension', () => {
    expect(
      parseRegions(typeClaims, 'compose.test-d.ts').get('widen')?.lang,
    ).toBe('ts');
    expect(
      parseRegions(typeClaims, 'widget.test-d.tsx').get('widen')?.lang,
    ).toBe('tsx');
    expect(parseRegions(typeClaims, 'cart.astro').get('widen')?.lang).toBe(
      'astro',
    );
  });

  it('reads a JSX comment marker, which is what an astro template has', () => {
    const template = [
      '<div>',
      '  {/* #region checkout-gate */}',
      '  <button disabled={!mayOrder}>Place the order</button>',
      '  {/* #endregion checkout-gate */}',
      '</div>',
    ].join('\n');

    expect(
      parseRegions(template, 'cart.astro').get('checkout-gate')?.code,
    ).toBe('<button disabled={!mayOrder}>Place the order</button>');
  });

  it('ignores an HTML comment marker in a source file', () => {
    const html = ['<!-- #region x -->', 'a();', '<!-- #endregion x -->'].join(
      '\n',
    );

    expect(parseRegions(html, 'a.ts').size).toBe(0);
  });

  it('rejects a region that is never closed', () => {
    expect(() => parseRegions('// #region x\na();', 'a.ts')).toThrow(
      /a\.ts:1: region 'x' is never closed/,
    );
  });

  it('rejects a mismatched #endregion name', () => {
    const crossed = ['// #region x', 'a();', '// #endregion y'].join('\n');

    expect(() => parseRegions(crossed, 'a.ts')).toThrow(RegionError);
  });

  it('rejects a nested region', () => {
    const nested = [
      '// #region x',
      '// #region y',
      'a();',
      '// #endregion y',
      '// #endregion x',
    ].join('\n');

    expect(() => parseRegions(nested, 'a.ts')).toThrow(
      /region 'y' opens inside region 'x'/,
    );
  });

  it('rejects an #endregion that closes nothing', () => {
    expect(() => parseRegions('// #endregion x', 'a.ts')).toThrow(
      /closes nothing/,
    );
  });

  it('rejects a duplicate region name', () => {
    const twice = [
      '// #region x',
      'a();',
      '// #endregion x',
      '// #region x',
      'b();',
      '// #endregion x',
    ].join('\n');

    expect(() => parseRegions(twice, 'a.ts')).toThrow(/defined twice/);
  });
});

describe('readRegion', () => {
  it('reads one region', () => {
    expect(readRegion(source, 'README.md', 'hex').code).toContain('createLuhn');
  });

  it('lists the regions that do exist when one is missing', () => {
    expect(() => readRegion(source, 'README.md', 'quickstart')).toThrow(
      /Regions in this file: hex, quick-start/,
    );
  });
});
