import { describe, expect, it } from 'vitest';

import { layoutText } from '../text/index.js';
import { describeThrown } from './describe-thrown.js';
import { DOCS_URL, issueLine, lineOf } from './line.js';
import { ModuleOptionsError } from './module-options-error.js';

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
  it('prints a null path segment, and an issue whose path is not an array by its message', () => {
    expect(lineOf('X', { issues: [{ message: 'm', path: [null, 'a'] }] })).toBe(
      `issues=null.a: m. ${DOCS_URL}X`,
    );
    expect(lineOf('X', { issues: [{ message: 'm', path: 'a' }] })).toBe(
      `issues=m. ${DOCS_URL}X`,
    );
  });

  it('prints ? for a path segment that throws when read, and keeps the other issues', () => {
    const segments: unknown[] = [
      { key: Object.create(null) },
      {
        get key(): never {
          throw new Error('key getter');
        },
      },
      new Proxy(
        {},
        {
          get: () => {
            throw new Error('trap');
          },
        },
      ),
    ];
    for (const segment of segments) {
      const error = new ModuleOptionsError({
        code: 'NEXUS_INVALID_MODULE_OPTIONS',
        module: 'M',
        issues: [
          { message: 'm', path: [segment as PropertyKey, 'a'] },
          { message: 'n', path: ['b'] },
        ],
      });
      expect(error.message).toBe(
        `[NEXUS_INVALID_MODULE_OPTIONS] module=M issues=?.a: m; b: n. ${DOCS_URL}NEXUS_INVALID_MODULE_OPTIONS`,
      );
    }
    expect(issueLine({ message: 'm', path: [undefined as never] })).toBe(
      'undefined: m',
    );
    expect(issueLine({ message: 'm', path: [Object.create(null)] })).toBe(
      'undefined: m',
    );
  });

  it('cuts a foreign cause at 500 characters and keeps a NexusError cause whole', () => {
    const head = `${DOCS_URL}X Cause: `;
    expect(
      lineOf('X', {}, DOCS_URL, { cause: new Error('x'.repeat(1000)) }),
    ).toBe(`${head}${`Error: ${'x'.repeat(1000)}`.slice(0, 500)}…`);
    expect(lineOf('X', {}, DOCS_URL, { cause: 'y'.repeat(500) })).toBe(
      `${head}${'y'.repeat(500)}`,
    );
    const inner = new ModuleOptionsError({
      code: 'NEXUS_INVALID_MODULE_OPTIONS',
      module: 'z'.repeat(1000),
      issues: [],
    });
    expect(lineOf('X', {}, DOCS_URL, { cause: inner })).toBe(
      `${head}${inner.message}`,
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

describe('describeThrown', () => {
  it('returns text for values whose reads throw', () => {
    const throwingName = new Error('e');
    Object.defineProperty(throwingName, 'name', {
      get() {
        throw new Error('g');
      },
    });
    const objectMessage = new Error('e');
    Object.defineProperty(objectMessage, 'message', {
      value: Object.create(null),
    });
    const values: unknown[] = [
      Symbol('s'),
      Object.create(null),
      {
        toString: () => {
          throw new Error('x');
        },
      },
      new Proxy(
        {},
        {
          get: () => {
            throw new Error('trap');
          },
          getPrototypeOf: () => {
            throw new Error('p');
          },
        },
      ),
      Object.assign(new Error('e'), { name: Symbol('n') }),
      throwingName,
      objectMessage,
    ];
    for (const value of values)
      expect(typeof describeThrown(value)).toBe('string');
  });
});
