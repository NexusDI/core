import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { whiteBoxNames } from './white-box';

/**
 * A package fixture: `src/` holds the code, `test-support/` sits beside it,
 * and the test file under `src/` imports through whatever form a case uses.
 * `defineModule` is the one public name.
 */
function fixture(imports: string): { file: string; src: string } {
  const root = mkdtempSync(join(tmpdir(), 'white-box-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'test-support'));
  const file = join(root, 'src', 'a.test.ts');
  writeFileSync(file, `${imports}\n`);
  return { file, src: `${join(root, 'src')}${sep}` };
}

const PUBLIC = new Set(['defineModule']);

const check = (imports: string, body: string): string[] => {
  const { file, src } = fixture(imports);
  return whiteBoxNames(file, body, src, PUBLIC);
};

describe('whiteBoxNames', () => {
  it('names an unexported name a named import brings in', () => {
    expect(
      check(
        "import { moduleInternals } from './define-module.js';",
        'expect(moduleInternals(Comms)).toBeDefined();',
      ),
    ).toEqual(['moduleInternals']);
  });

  it('passes a public name a named import brings in', () => {
    expect(
      check(
        "import { defineModule } from './define-module.js';",
        "defineModule({ name: 'Comms' });",
      ),
    ).toEqual([]);
  });

  it('reads the original name of an aliased import', () => {
    expect(
      check(
        "import { moduleInternals as peek } from './define-module.js';",
        'peek(Comms);',
      ),
    ).toEqual(['moduleInternals']);
  });

  it('names an unexported property read off a namespace import', () => {
    expect(
      check(
        "import * as dm from './define-module.js';",
        "dm.defineModule({ name: 'Comms' }); dm.moduleInternals(Comms);",
      ),
    ).toEqual(['moduleInternals']);
  });

  it('names an unexported key read off a namespace import by string', () => {
    expect(
      check(
        "import * as dm from './define-module.js';",
        "dm['moduleInternals'](Comms);",
      ),
    ).toEqual(['moduleInternals']);
  });

  it('names a default import from src', () => {
    expect(
      check("import peek from './define-module.js';", 'peek(Comms);'),
    ).toEqual(['default']);
  });

  it('names a dynamic import of src destructured in the case', () => {
    expect(
      check(
        '',
        "const { moduleInternals: peek, defineModule } = await import('./define-module.js');\npeek(Comms);",
      ),
    ).toEqual(['moduleInternals']);
  });

  it('names a property read off a dynamic import of src', () => {
    expect(
      check('', "(await import('./define-module.js')).moduleInternals(Comms);"),
    ).toEqual(['moduleInternals']);
  });

  it('names a property read off a namespace a dynamic import of src bound', () => {
    expect(
      check(
        "const dm = await import('./define-module.js');",
        'dm.moduleInternals(Comms);',
      ),
    ).toEqual(['moduleInternals']);
  });

  it('names a dynamic import of src whose result it cannot follow', () => {
    expect(check('', "await load(import('./define-module.js'));")).toEqual([
      "import('./define-module.js')",
    ]);
  });

  it('leaves out an import from test-support and from another package', () => {
    expect(
      check(
        "import { rootState } from '../test-support/root-state.js';\nimport { Token } from '@nexusdi/core';",
        'rootState(); new Token();',
      ),
    ).toEqual([]);
  });

  it('reads no name a comment or a string carries', () => {
    expect(
      check(
        "import { moduleInternals } from './define-module.js';",
        "// moduleInternals stays out of this case\nexpect('moduleInternals').toBe('moduleInternals');",
      ),
    ).toEqual([]);
  });
});
