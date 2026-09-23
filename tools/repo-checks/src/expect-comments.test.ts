import { describe, expect, it } from 'vitest';

import {
  ExpectCommentError,
  readValueClaim,
  rewriteJsDoc,
  rewriteLine,
  rewriteMarkdown,
} from '@nexusdi/doc-examples';

/**
 * The rewriter turns a README's `// -> value` claim into an assertion.
 *
 * Most of this file is about the lines it must leave alone. A rewriter that
 * fires on the wrong line turns a correct document into a confusing test
 * failure, which is the failure that would make the whole mechanism
 * untrustworthy.
 */

const at = (line: string) => rewriteLine(line, 'test.md', 1);

describe('readValueClaim', () => {
  it('splits a claim into its expression and its value', () => {
    expect(
      readValueClaim("Luhn.generate('foo'); // -> { checksum: '5' }"),
    ).toEqual({
      indent: '',
      statement: "Luhn.generate('foo')",
      expected: "{ checksum: '5' }",
    });
  });

  it('keeps the indent, so a rewrite can put it back', () => {
    expect(readValueClaim('  f(); // -> 1')?.indent).toBe('  ');
  });

  it('reads nothing from a line with no claim', () => {
    expect(readValueClaim('const x = 1;')).toBeNull();
    expect(readValueClaim('f(); // a plain comment')).toBeNull();
  });

  it('ignores a marker inside a string', () => {
    expect(readValueClaim("f('// -> not a claim');")).toBeNull();
  });

  it('does not judge a claim it cannot turn into an assertion', () => {
    expect(readValueClaim('// -> 1')).toEqual({
      indent: '',
      statement: '',
      expected: '1',
    });
  });
});

describe('rewriteLine', () => {
  it('rewrites a value claim', () => {
    expect(at("Luhn.generate('foo'); // -> { checksum: '5' }")).toBe(
      "expect(Luhn.generate('foo')).toEqual({ checksum: '5' });",
    );
  });

  it('keeps the indentation, so a claim inside a block stays in its block', () => {
    expect(at('  x.y(); // -> 1')).toBe('  expect(x.y()).toEqual(1);');
  });

  it('accepts a claim on an expression with no trailing semicolon', () => {
    expect(at('Luhn.n // -> 36')).toBe('expect(Luhn.n).toEqual(36);');
  });

  it('produces exactly one line, because doctest maps blocks by line number', () => {
    const multiline = at('f(); // -> { a: 1,\n b: 2 }'.replace('\n', ' '));
    expect(multiline.split('\n')).toHaveLength(1);
  });

  it('asserts the binding when the claim is on a declaration', () => {
    expect(at('const hex = createLuhn(); // -> 1')).toBe(
      'const hex = createLuhn(); expect(hex).toEqual(1);',
    );
  });

  describe('imports, so a README example can show where the names come from', () => {
    it('rewrites a named import to the dynamic form', () => {
      expect(at("import { Luhn } from '@evanion/luhn';")).toBe(
        "const { Luhn } = await import('@evanion/luhn');",
      );
    });

    it('rewrites a renamed binding', () => {
      expect(at("import { a as b } from 'x';")).toBe(
        "const { a: b } = await import('x');",
      );
    });

    it('rewrites a default import', () => {
      expect(at("import React from 'react';")).toBe(
        "const { default: React } = await import('react');",
      );
    });

    it('rewrites a namespace import', () => {
      expect(at("import * as path from 'node:path';")).toBe(
        "const path = await import('node:path');",
      );
    });

    it('rewrites a side-effect import', () => {
      expect(at("import 'reflect-metadata';")).toBe(
        "await import('reflect-metadata');",
      );
    });

    it('drops an inline type specifier, which binds nothing at runtime', () => {
      expect(at("import W, { type Item } from '@evanion/react-widget';")).toBe(
        "const { default: W } = await import('@evanion/react-widget');",
      );
    });

    it('comments out a type-only import', () => {
      expect(at("import type { Item } from 'x';")).toBe(
        "// import type { Item } from 'x';",
      );
    });

    it('keeps the specifier, so a block resolves the package a reader would', () => {
      expect(at("import { URN } from '@evanion/urn';")).toContain(
        "'@evanion/urn'",
      );
    });
  });

  describe('does not fire', () => {
    it('on a line with no comment', () => {
      const line = 'const x = compose(a, b);';
      expect(at(line)).toBe(line);
    });

    it('on a plain comment', () => {
      const line = 'const x = 1; // the default dictionary';
      expect(at(line)).toBe(line);
    });

    it('on a comment that is prose rather than a value', () => {
      const line = 'const x = 1; // returns the widget';
      expect(at(line)).toBe(line);
    });

    it('when -> appears inside a string literal', () => {
      const line = "const s = 'a // -> 3';";
      expect(at(line)).toBe(line);
    });

    it('when -> appears inside a template literal', () => {
      const line = 'const s = `see // -> 3`;';
      expect(at(line)).toBe(line);
    });

    it('when a string holds an escaped quote before the marker', () => {
      const line = "const s = 'it\\'s // -> 3';";
      expect(at(line)).toBe(line);
    });

    it('on an arrow function, whose => is not a comment marker', () => {
      const line = 'const f = (x: number) => x + 1;';
      expect(at(line)).toBe(line);
    });

    it('on an arrow function carrying an ordinary comment', () => {
      const line = 'const f = (x) => x + 1; // adds one';
      expect(at(line)).toBe(line);
    });

    it('on a url in a comment', () => {
      const line = 'const x = 1; // https://example.com';
      expect(at(line)).toBe(line);
    });
  });

  describe('fails loudly rather than skipping', () => {
    it('when the claimed value does not parse', () => {
      expect(() => at('f(); // -> a widget, usually')).toThrow(
        ExpectCommentError,
      );
    });

    it('when the expression before the claim does not parse', () => {
      expect(() => at('}); // -> 1')).toThrow(ExpectCommentError);
    });

    it('when there is no expression before the claim', () => {
      expect(() => at('// -> 1')).toThrow(ExpectCommentError);
    });

    it('when the claim is on a destructuring, which has no one value', () => {
      expect(() => at('const { a } = f(); // -> 1')).toThrow(
        ExpectCommentError,
      );
    });

    it('names the file and line', () => {
      expect(() =>
        rewriteLine('f(); // -> nope nope', 'README.md', 12),
      ).toThrow(/README\.md:12/);
    });
  });
});

describe('rewriteMarkdown', () => {
  const fence = '```';

  it('rewrites inside a marked block', () => {
    const source = [
      'Prose. // -> not code',
      `${fence}ts @import.meta.vitest`,
      'f(); // -> 1',
      fence,
    ].join('\n');

    expect(rewriteMarkdown(source, 'README.md')).toContain(
      'expect(f()).toEqual(1);',
    );
  });

  it('leaves an unmarked block alone', () => {
    const source = [`${fence}ts`, 'f(); // -> 1', fence].join('\n');

    expect(rewriteMarkdown(source, 'README.md')).toBe(source);
  });

  it('leaves prose alone, where a -> is punctuation', () => {
    const source = 'The call // -> the result.';

    expect(rewriteMarkdown(source, 'README.md')).toBe(source);
  });

  it('preserves the line count', () => {
    const source = [
      '# Title',
      '',
      `${fence}ts @import.meta.vitest`,
      'f(); // -> 1',
      'g(); // -> 2',
      fence,
      '',
      'After.',
    ].join('\n');

    expect(rewriteMarkdown(source, 'README.md').split('\n')).toHaveLength(
      source.split('\n').length,
    );
  });

  it('closes a block on its own fence length, so a nested fence does not end it', () => {
    const source = [
      '````md @import.meta.vitest',
      `${fence}ts`,
      fence,
      'f(); // -> 1',
      '````',
    ].join('\n');

    expect(rewriteMarkdown(source, 'README.md')).toContain(
      'expect(f()).toEqual(1);',
    );
  });
});

describe('rewriteJsDoc', () => {
  const fence = '```';

  it('rewrites inside a marked @example block', () => {
    const source = [
      '/**',
      ' * @example',
      ` * ${fence}ts @import.meta.vitest`,
      ' * f(); // -> 1',
      ` * ${fence}`,
      ' */',
      'export function f() { return 1; }',
    ].join('\n');

    expect(rewriteJsDoc(source, 'f.ts')).toContain(
      ' * expect(f()).toEqual(1);',
    );
  });

  it('leaves an ordinary trailing comment in code alone', () => {
    const source = 'export const n = 36; // -> not a claim, this is source';

    expect(rewriteJsDoc(source, 'f.ts')).toBe(source);
  });

  it('leaves an unmarked @example block alone', () => {
    const source = [
      '/**',
      ' * @example',
      ` * ${fence}ts`,
      ' * f(); // -> 1',
      ` * ${fence}`,
      ' */',
    ].join('\n');

    expect(rewriteJsDoc(source, 'f.ts')).toBe(source);
  });

  it('preserves the line count', () => {
    const source = [
      '/**',
      ` * ${fence}ts @import.meta.vitest`,
      ' * f(); // -> 1',
      ` * ${fence}`,
      ' */',
      'export const f = () => 1;',
    ].join('\n');

    expect(rewriteJsDoc(source, 'f.ts').split('\n')).toHaveLength(
      source.split('\n').length,
    );
  });
});
