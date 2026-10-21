import { describe, expect, it } from 'vitest';

import { layoutText } from '../text/index.js';
import { DOCS_URL, lineOf } from './line.js';

describe('layoutText', () => {
  it('writes the code in brackets before the message', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
      }),
    ).toBe('[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.');
  });

  it('writes each hint on its own line, indented by two spaces', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
        hints: ['Engineering declares it.', 'Command never imports it.'],
      }),
    ).toBe(
      [
        '[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.',
        '  Engineering declares it.',
        '  Command never imports it.',
      ].join('\n'),
    );
  });

  it('writes the fix last, after the hints', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
        hints: ['Engineering declares it.'],
        fix: 'Add Engineering to the imports of Command.',
      }),
    ).toBe(
      [
        '[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.',
        '  Engineering declares it.',
        '  Fix: Add Engineering to the imports of Command.',
      ].join('\n'),
    );
  });

  it('writes a fix without hints directly under the message', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
        fix: 'Add Engineering to the imports of Command.',
      }),
    ).toBe(
      [
        '[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.',
        '  Fix: Add Engineering to the imports of Command.',
      ].join('\n'),
    );
  });
});

describe('lineOf', () => {
  const issues = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      message: `m${i + 1}`,
      path: [String.fromCharCode(97 + i)],
    }));

  it('prints each issue as path: message, a { key } segment by its key', () => {
    expect(
      lineOf('NEXUS_INVALID_MODULE_OPTIONS', {
        module: 'Simulation',
        issues: [
          { message: 'expected an integer, received 1.5', path: ['seed'] },
          { message: 'expected 1 to 10', path: [{ key: 'crew' }, 0] },
          { message: 'expected an object' },
          { message: 'unknown key', path: [] },
        ],
      }),
    ).toBe(
      `module=Simulation issues=seed: expected an integer, received 1.5; crew.0: expected 1 to 10; expected an object (and 1 more). ${DOCS_URL}NEXUS_INVALID_MODULE_OPTIONS`,
    );
  });

  it('prints the first three issues and counts the rest', () => {
    expect(lineOf('X', { issues: issues(5) })).toBe(
      `issues=a: m1; b: m2; c: m3 (and 2 more). ${DOCS_URL}X`,
    );
    expect(lineOf('X', { issues: issues(3) })).toBe(
      `issues=a: m1; b: m2; c: m3. ${DOCS_URL}X`,
    );
  });

  it('prints a symbol key and escapes a line break in an issue', () => {
    expect(
      lineOf('X', {
        issues: [{ message: 'two\nlines', path: [Symbol('id')] }],
      }),
    ).toBe(`issues=Symbol(id): two\\nlines. ${DOCS_URL}X`);
  });

  it('leaves out an empty array, and arrays of Errors or of objects without a message', () => {
    expect(
      lineOf('X', {
        issues: [],
        errors: [new Error('boom')],
        alsoFailed: [{ token: 'A', module: 'M', cause: 1 }],
      }),
    ).toBe(`${DOCS_URL}X`);
  });

  it('follows the link with the cause, on one line', () => {
    expect(
      lineOf('X', { token: 'A' }, DOCS_URL, {
        cause: new TypeError('db\ndown'),
      }),
    ).toBe(`token=A. ${DOCS_URL}X Cause: TypeError: db\\ndown`);
    expect(lineOf('X', {}, DOCS_URL, { cause: undefined })).toBe(
      `${DOCS_URL}X Cause: undefined`,
    );
    expect(lineOf('X', {}, DOCS_URL, {})).toBe(`${DOCS_URL}X`);
  });
  it('prints a null path segment, and leaves out issues with a path that is not an array', () => {
    expect(lineOf('X', { issues: [{ message: 'm', path: [null, 'a'] }] })).toBe(
      `issues=null.a: m. ${DOCS_URL}X`,
    );
    expect(lineOf('X', { issues: [{ message: 'm', path: 'a' }] })).toBe(
      `${DOCS_URL}X`,
    );
  });

  it('prints a cause whose message cannot be read without throwing', () => {
    class Unreadable extends Error {
      override get message(): string {
        throw new Error('no message');
      }
    }
    const symbolic = new Error('x');
    Object.defineProperty(symbolic, 'message', { value: Symbol('m') });
    const trapped = new Proxy(new Error('x'), {
      getPrototypeOf: () => {
        throw new Error('trap');
      },
    });
    for (const cause of [new Unreadable(), symbolic, trapped]) {
      const line = lineOf('X', {}, DOCS_URL, { cause });
      expect(line.startsWith(`${DOCS_URL}X Cause: `)).toBe(true);
      expect(line.length).toBeGreaterThan(`${DOCS_URL}X Cause: `.length);
    }
  });
});
