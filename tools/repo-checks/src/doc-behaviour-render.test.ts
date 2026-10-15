import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chainsOf } from '@nexusdi/doc-examples/behaviours';
import { describe, expect, it } from 'vitest';

/**
 * The parsing half of the behaviour catalogue.
 *
 * `chainsOf` decides which sentence a case contributes. A source written here
 * drives it, because the thing under test is what a runner does with
 * `describe.each` and a skipped case, and a real suite carries one shape of
 * each at best.
 */

/** A test source, written where the parser can read it as a file. */
function write(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'behaviours-')), 'a.test.ts');
  writeFileSync(path, contents);
  return path;
}

describe('chainsOf', () => {
  it('carries every `describe` above a case, outermost first', () => {
    const found = chainsOf(
      write(
        `describe('widen', () => {
           describe('a narrowing', () => {
             it('refuses a key the document never held', () => {});
           });
         });`,
      ),
    );

    expect(found).toMatchObject([
      {
        chain: [
          'widen',
          'a narrowing',
          'refuses a key the document never held',
        ],
        generated: false,
      },
    ]);
  });

  it('carries the case body, with the nesting taken off the front', () => {
    const [found] = chainsOf(
      write(
        `describe('widen', () => {
           describe('a narrowing', () => {
             it('refuses a key the document never held', () => {
               const out = widen(matrix, {});
               expect(out).toBe(null);
             });
           });
         });`,
      ),
    );

    expect(
      found?.body,
      'The pane shows the assertions the author wrote and never a reading of ' +
        'them, and it shows them at column zero however deep the case sits.',
    ).toBe('const out = widen(matrix, {});\nexpect(out).toBe(null);');
    expect(found?.line).toBe(3);
  });

  it('maps every character of a body back to where it stood in the file', () => {
    const source = [
      "describe('widen', () => {",
      "  it('keeps the key', () => {",
      '    const kept = widen(listing);',
      '    expect(kept).toBe(listing);',
      '  });',
      '});',
    ].join('\n');
    const [found] = chainsOf(write(source));

    expect(found.offsets).toHaveLength(found.body.length);
    for (const [at, offset] of found.offsets.entries()) {
      expect(source[offset]).toBe(found.body[at]);
    }
  });

  it('collapses a seeded case into the block that names what it is about', () => {
    const found = chainsOf(
      write(
        `describe('widen', () => {
           describe('an overlay that matches nothing changes no decision', () => {
             it.each([1, 2])('seed %i', () => {});
           });
         });`,
      ),
    );

    expect(found).toMatchObject([
      {
        chain: ['widen', 'an overlay that matches nothing changes no decision'],
        generated: true,
      },
    ]);
    expect(
      found[0]?.body,
      'A seeded case has no sentence of its own, so what it asserts is the ' +
        'whole call, seeds included.',
    ).toContain('it.each([1, 2])');
  });

  it('drops a block whose own title is written per row', () => {
    const found = chainsOf(
      write(
        `describe.each(['a', 'b'])('over the %s instance', () => {
           it('reaches every index', () => {});
         });`,
      ),
    );

    expect(
      found,
      'The runner reports `over the a instance`, so the title in the source ' +
        'is a format string no case ever ran under.',
    ).toEqual([]);
  });

  it('drops a case the runner never reaches', () => {
    const found = chainsOf(
      write(
        `describe('widen', () => {
           it.skip('refuses a key the document never held', () => {});
           it.todo('names the key');
         });`,
      ),
    );

    expect(found).toEqual([]);
  });
});
