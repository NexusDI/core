import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { impurities, MODULE_LINE_LIMIT } from './meridian-purity.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'meridian-purity');

/** A fixture's text. The fixtures are .txt so lint, tsc and fallow skip them. */
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const source = (path: string, name: string) => ({
  path,
  text: fixture(name),
});

describe('impurities', () => {
  it('reports a @nexusdi/ import under physics and allows it elsewhere', () => {
    const text = fixture('physics-imports-core.txt');
    expect(impurities([{ path: 'src/physics/gas.ts', text }])).toEqual([
      'src/physics/gas.ts:1 imports @nexusdi/; physics files stay free of DI',
    ]);
    expect(impurities([{ path: 'src/simulation/gas.ts', text }])).toEqual([]);
  });

  it.each(['physics-side-effect-import.txt', 'physics-require.txt'])(
    'reports %s under physics',
    (name) => {
      expect(impurities([source('src/physics/gas.ts', name)])).toEqual([
        'src/physics/gas.ts:1 imports @nexusdi/; physics files stay free of DI',
      ]);
    },
  );

  it('allows a physics file with relative imports', () => {
    expect(
      impurities([source('src/physics/gas.ts', 'physics-clean.txt')]),
    ).toEqual([]);
  });

  it('reports a physics file that imports from a system folder', () => {
    const text = fixture('physics-imports-system.txt');
    expect(impurities([{ path: 'src/physics/doors.ts', text }])).toEqual([
      'src/physics/doors.ts:1 imports from systems/; physics files hold laws no system owns',
    ]);
    expect(impurities([{ path: 'src/simulation/doors.ts', text }])).toEqual([]);
  });

  it.each([
    'physics-side-effect-system.txt',
    'physics-dynamic-system.txt',
    'physics-require-system.txt',
  ])('reports %s under physics', (name) => {
    expect(impurities([source('src/physics/doors.ts', name)])).toEqual([
      'src/physics/doors.ts:1 imports from systems/; physics files hold laws no system owns',
    ]);
  });

  it('reports a @nexusdi/ import in a model file and allows it elsewhere', () => {
    const text = fixture('model-imports-core.txt');
    expect(
      impurities([{ path: 'src/systems/comms/comms-model.ts', text }]),
    ).toEqual([
      'src/systems/comms/comms-model.ts:1 imports @nexusdi/; model files stay free of DI',
    ]);
    expect(
      impurities([{ path: 'src/systems/comms/contracts.ts', text }]),
    ).toEqual([]);
  });

  it('allows a model file that imports another system by relative path', () => {
    expect(
      impurities([
        source('src/systems/safety/safety-model.ts', 'model-clean.txt'),
      ]),
    ).toEqual([]);
  });

  it('reports a module file over the line limit', () => {
    const long = `${'// line\n'.repeat(MODULE_LINE_LIMIT + 1)}`;
    const ok = `${'// line\n'.repeat(MODULE_LINE_LIMIT)}`;
    expect(
      impurities([{ path: 'src/big.module.ts', text: long }]),
    ).toHaveLength(1);
    expect(impurities([{ path: 'src/big.module.ts', text: ok }])).toEqual([]);
    expect(impurities([{ path: 'src/big.ts', text: long }])).toEqual([]);
  });

  it('accepts a clean tree', () => {
    expect(impurities([source('src/clean.ts', 'clean.txt')])).toEqual([]);
  });
});

/** Every .ts file under `dir`, with paths relative to the workspace root. */
function walk(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.name.endsWith('.ts')) return [];
    return [
      {
        path: relative(workspaceRoot, full),
        text: readFileSync(full, 'utf-8'),
      },
    ];
  });
}

describe('examples/meridian-systems/src', () => {
  const files = walk(join(workspaceRoot, 'examples/meridian-systems/src'));

  it('finds the library sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('holds the purity rules', () => {
    expect(impurities(files)).toEqual([]);
  });
});

/*
 * ESLint enforces the replay rules on the syntax tree, so an alias, a
 * destructure or an import of a host module fails the same as a direct call.
 * ESLint resolves a flat config from its cwd, so the linter starts in the
 * library's folder to load examples/meridian-systems/eslint.config.mjs.
 */
const LIBRARY = join(workspaceRoot, 'examples/meridian-systems');
const eslint = new ESLint({ cwd: LIBRARY });

const PURITY_RULES = [
  '@typescript-eslint/no-restricted-imports',
  '@typescript-eslint/no-import-type-side-effects',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
];

/** The purity rule ids ESLint reports for `code` in a file at `path`. */
async function purityHits(code: string, path = 'src/simulation/x.ts') {
  const [result] = await eslint.lintText(code, {
    filePath: join(LIBRARY, path),
  });
  return (result?.messages ?? [])
    .map((message) => message.ruleId)
    .filter((rule): rule is string => PURITY_RULES.includes(rule ?? ''));
}

describe('the meridian-systems eslint purity rules', () => {
  it.each([
    ['Math.random()', 'export const r = Math.random();'],
    ["Math['random']()", "export const r = Math['random']();"],
    [
      'a Math destructure',
      'const { random } = Math;\nexport const r = random();',
    ],
    ['Date.now()', 'export const t = Date.now();'],
    ['new Date()', 'export const t = new Date();'],
    ['Date()', 'export const t = Date();'],
    ['a Date destructure', 'const { now } = Date;\nexport const t = now();'],
    ["globalThis['Date']", "export const t = globalThis['Date'].now();"],
    ['global.Date', 'export const t = global.Date.now();'],
    ['Bun.nanoseconds()', 'export const t = Bun.nanoseconds();'],
    ['Deno.connect()', 'export const c = await Deno.connect({ port: 80 });'],
    ['performance.now()', 'export const t = performance.now();'],
    ['process.hrtime()', 'export const t = process.hrtime();'],
    ['process.uptime()', 'export const t = process.uptime();'],
    ['Temporal.Now', 'export const t = Temporal.Now.instant();'],
    ['scheduler.wait', 'export const w = scheduler.wait(1);'],
    ['setTimeout', 'setTimeout(() => 0, 1);'],
    ['setInterval', 'setInterval(() => 0, 1);'],
    ['setImmediate', 'setImmediate(() => 0);'],
    ['requestAnimationFrame', 'requestAnimationFrame(() => 0);'],
    ['crypto.getRandomValues', 'crypto.getRandomValues(new Uint8Array(1));'],
    ['crypto.randomUUID', 'export const id = crypto.randomUUID();'],
    [
      'node:crypto randomInt',
      "import { randomInt } from 'node:crypto';\nexport const r = randomInt(9);",
    ],
    [
      'node:crypto randomBytes',
      "import { randomBytes } from 'node:crypto';\nexport const r = randomBytes(1);",
    ],
    [
      'a bare crypto import',
      "import { randomInt } from 'crypto';\nexport const r = randomInt(9);",
    ],
    [
      'node:perf_hooks performance',
      "import { performance } from 'node:perf_hooks';\nexport const t = performance.now();",
    ],
    [
      'a package import',
      "import { sum } from 'lodash';\nexport const s = sum([1]);",
    ],
    ['a dynamic import', "export const c = await import('node:crypto');"],
    ['require', "export const c = require('node:crypto');"],
    ['eval', "export const t = eval('Date.now()');"],
    ['Function', "export const t = Function('return Date.now()')();"],
    ['new Function', "export const t = new Function('return Date.now()')();"],
    ['a Math alias', 'const M = Math;\nexport const r = M.random();'],
    ['Reflect.get on Math', "export const r = Reflect.get(Math, 'random')();"],
    [
      'a property descriptor of Math',
      "export const d = Object.getOwnPropertyDescriptor(Math, 'random');",
    ],
    ['a computed Math key', "const k = 'random';\nexport const r = Math[k]();"],
    ['Intl', 'export const t = Intl.DateTimeFormat().format();'],
    ['WeakRef', 'export const w = new WeakRef({});'],
    [
      'FinalizationRegistry',
      'export const f = new FinalizationRegistry(() => undefined);',
    ],
    ['Atomics', 'export const a = Atomics.load(new Int32Array(1), 0);'],
    [
      'the constructor of a function',
      "export const t = (() => undefined).constructor('return Date.now()')();",
    ],
    [
      'constructor.constructor',
      "export const t = ({}).constructor.constructor('return Date.now()')();",
    ],
    [
      'a computed constructor key',
      "export const t = (() => undefined)['constructor']('return Date.now()')();",
    ],
  ])('refuses %s', async (_name, code) => {
    expect(await purityHits(code)).not.toEqual([]);
  });

  it.each([
    [
      'a value import of @nexusdi/interceptors',
      "import { interceptors } from '@nexusdi/interceptors';\nexport const x = interceptors;",
    ],
    [
      'a subpath type import of @nexusdi/interceptors',
      "import type { Interceptor } from '@nexusdi/interceptors/text';\nexport type X = Interceptor;",
    ],
    [
      'a subpath value import of @nexusdi/interceptors',
      "import { interceptorsText } from '@nexusdi/interceptors/text';\nexport const x = interceptorsText;",
    ],
    [
      'a side-effect import of @nexusdi/interceptors',
      "import '@nexusdi/interceptors';",
    ],
    [
      'a mixed import of @nexusdi/interceptors',
      "import { interceptors, type Interceptor } from '@nexusdi/interceptors';\nexport type X = Interceptor;\nexport const x = interceptors;",
    ],
    [
      'an import type of node:crypto',
      "import type { webcrypto } from 'node:crypto';\nexport type X = webcrypto.Crypto;",
    ],
    [
      'an inline type import that leaves a bare import behind',
      "import { type Interceptor } from '@nexusdi/interceptors';\nexport type X = Interceptor;",
    ],
  ])('refuses %s', async (_name, code) => {
    expect(await purityHits(code)).not.toEqual([]);
  });

  it('refuses fetch in every file but the subspace relay', async () => {
    const code = "export const r = fetch('https://relay.test');";
    expect(await purityHits(code)).toEqual(['no-restricted-globals']);
    expect(
      await purityHits(code, 'src/systems/comms/subspace-relay.ts'),
    ).toEqual([]);
  });

  it.each([
    ['new WebSocket', "export const s = new WebSocket('wss://relay.test');"],
    ['new XMLHttpRequest', 'export const x = new XMLHttpRequest();'],
    [
      'new EventSource',
      "export const e = new EventSource('https://relay.test');",
    ],
    [
      'navigator.sendBeacon',
      "export const b = navigator.sendBeacon('https://relay.test', 'x');",
    ],
    [
      'a sendBeacon destructure',
      "const { sendBeacon } = navigator;\nexport const b = sendBeacon('https://relay.test');",
    ],
    [
      'a navigator alias',
      "const n = navigator;\nexport const b = n.sendBeacon('https://relay.test');",
    ],
    [
      'new WebTransport',
      "export const w = new WebTransport('https://relay.test');",
    ],
    ['importScripts', "importScripts('https://relay.test/x.js');"],
    [
      'new Worker',
      "export const w = new Worker('https://relay.test/w.js', { type: 'module' });",
    ],
    [
      'new WebSocketStream',
      "export const s = new WebSocketStream('wss://relay.test');",
    ],
  ])(
    'refuses %s in every file, the subspace relay included',
    async (_n, code) => {
      expect(await purityHits(code)).toContain('no-restricted-globals');
      expect(
        await purityHits(code, 'src/systems/comms/subspace-relay.ts'),
      ).toContain('no-restricted-globals');
    },
  );

  it('refuses a clock in a test file', async () => {
    expect(
      await purityHits('export const t = Date.now();', 'src/x.test.ts'),
    ).not.toEqual([]);
  });

  it.each([
    [
      'the deck JSON import',
      "import deck from '../../deck/meridian.deck.json' with { type: 'json' };\nexport const d = deck;",
    ],
    [
      'a relative import',
      "import { R } from './constants';\nexport const r = R;",
    ],
    [
      '@nexusdi/core',
      "import { Token } from '@nexusdi/core';\nexport const t = Token;",
    ],
    [
      'an import type of @nexusdi/interceptors',
      "import type { Interceptor } from '@nexusdi/interceptors';\nexport type X = Interceptor;",
    ],
    ['queueMicrotask', 'queueMicrotask(() => undefined);'],
    [
      'the Math functions the physics calls',
      'export const z = Math.imul(Math.exp(1), Math.floor(Math.PI));',
    ],
  ])('allows %s', async (_name, code) => {
    expect(await purityHits(code)).toEqual([]);
  });

  it.each([
    ['vitest', "import { it } from 'vitest';\nexport const t = it;"],
    [
      '@nexusdi/errors',
      "import { explain } from '@nexusdi/errors';\nexport const e = explain;",
    ],
  ])('allows %s in a test file and nowhere else', async (_name, code) => {
    expect(await purityHits(code, 'src/physics/gas.test.ts')).toEqual([]);
    expect(await purityHits(code)).not.toEqual([]);
  });
});

/** The rule's options from a resolved config, after its severity. */
function options(config: Linter.Config, rule: string): unknown[] {
  const entry = config.rules?.[rule];
  expect(Array.isArray(entry), `${rule} is configured`).toBe(true);
  const [severity, ...rest] = entry as unknown[];
  expect([2, 'error'], `${rule} is an error`).toContain(severity);
  return rest;
}

const names = (entries: unknown[]) =>
  entries.map((entry) =>
    typeof entry === 'string' ? entry : (entry as { name: string }).name,
  );

/** Math anywhere but the object of a plain `Math.name` read. */
const MATH_ALIAS =
  "Identifier[name='Math']:not(MemberExpression[computed=false] > Identifier.object)";
/** `Math[key]`, which no-restricted-properties reads only for a literal key. */
const MATH_COMPUTED = "MemberExpression[object.name='Math'][computed=true]";
/** A read of `constructor`, which reaches the Function constructor from any value. */
const CONSTRUCTOR_READ =
  "MemberExpression:matches([property.name='constructor'][computed=false], [property.value='constructor'])";

/** The globals that reach the host's clock, timers, randomness or global object. */
const HOST_GLOBALS = [
  'Date',
  'performance',
  'Temporal',
  'process',
  'crypto',
  'scheduler',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'globalThis',
  'global',
  'window',
  'self',
  'require',
  'eval',
  'Function',
  'Intl',
  'WeakRef',
  'FinalizationRegistry',
  'Atomics',
  'Bun',
  'Deno',
];

/** The globals that reach the network. The relay reaches it through fetch alone. */
const NETWORK = [
  'WebSocket',
  'XMLHttpRequest',
  'EventSource',
  'navigator',
  'WebTransport',
  'importScripts',
  'Worker',
  'WebSocketStream',
];

/*
 * The config itself is pinned so a later edit cannot drop a rule or an entry
 * while the bypass cases above still read green on a narrower list.
 */
describe('the meridian-systems eslint config', () => {
  it('holds every host and network global but fetch for the subspace relay', async () => {
    const config = (await eslint.calculateConfigForFile(
      join(LIBRARY, 'src/systems/comms/subspace-relay.ts'),
    )) as Linter.Config;
    expect(new Set(names(options(config, 'no-restricted-globals')))).toEqual(
      new Set([...HOST_GLOBALS, ...NETWORK]),
    );
  });

  it.each(['src/simulation/x.ts', 'src/physics/gas.test.ts'])(
    'holds the purity rules for %s',
    async (path) => {
      const config = (await eslint.calculateConfigForFile(
        join(LIBRARY, path),
      )) as Linter.Config;

      expect(new Set(names(options(config, 'no-restricted-globals')))).toEqual(
        new Set([...HOST_GLOBALS, ...NETWORK, 'fetch']),
      );

      expect(options(config, 'no-restricted-properties')).toContainEqual(
        expect.objectContaining({ object: 'Math', property: 'random' }),
      );

      expect(config.rules?.['no-restricted-imports']).toEqual([0]);
      expect(
        config.rules?.['@typescript-eslint/no-import-type-side-effects'],
      ).toEqual([2]);
      const [imports] = options(
        config,
        '@typescript-eslint/no-restricted-imports',
      ) as [{ patterns: { regex: string; allowTypeImports?: boolean }[] }];
      const regex = new RegExp(imports.patterns[0]?.regex ?? '$^');
      // The bare package passes the first pattern; the second holds it to
      // import type.
      expect(regex.test('@nexusdi/interceptors')).toBe(false);
      expect(regex.test('@nexusdi/interceptors/text')).toBe(true);
      const bare = imports.patterns[1];
      expect(bare?.allowTypeImports).toBe(true);
      expect(
        new RegExp(bare?.regex ?? '$^').test('@nexusdi/interceptors'),
      ).toBe(true);
      expect(
        new RegExp(bare?.regex ?? '$^').test('@nexusdi/interceptors/text'),
      ).toBe(false);
      expect(regex.test('node:crypto')).toBe(true);
      expect(regex.test('crypto')).toBe(true);
      expect(regex.test('@nexusdi/core')).toBe(false);
      // Only src imports zod/mini, for the options schemas; a test file does
      // not, and the full zod bundle stays out of the Worker.
      expect(regex.test('zod/mini')).toBe(path.endsWith('.test.ts'));
      expect(regex.test('zod')).toBe(true);
      expect(regex.test('zod/v4')).toBe(true);
      expect(regex.test('lodash')).toBe(true);
      // A test file imports @nexusdi/errors for explain(); src does not.
      expect(regex.test('@nexusdi/errors')).toBe(!path.endsWith('.test.ts'));
      expect(regex.test('./contracts')).toBe(false);
      expect(regex.test('../../deck/meridian.deck.json')).toBe(false);

      expect(options(config, 'no-restricted-syntax')).toContainEqual(
        expect.objectContaining({ selector: 'ImportExpression' }),
      );
      expect(
        (options(config, 'no-restricted-syntax') as { selector: string }[]).map(
          ({ selector }) => selector,
        ),
      ).toEqual(
        expect.arrayContaining([MATH_ALIAS, MATH_COMPUTED, CONSTRUCTOR_READ]),
      );
    },
  );
});
