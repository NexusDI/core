import { describe, expect, it } from 'vitest';

import { computeVisibilityOracle } from '../../test-support/visibility-oracle.js';
import {
  defineModule,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, Token, displayName } from '../definitions/token.js';
import type { NexusError } from '../errors/index.js';
import {
  REQUEST_ID,
  type ModuleNode,
  type ProviderRecord,
  type TokenKey,
} from './blueprint.js';
import { computeVisibility, type VisibilityInput } from './visibility.js';
import { walk } from './walk.js';

const GRAPHS = 600;
const SEED = 0x5eed_1234;

/** mulberry32: a small seeded PRNG, so every run generates the same graphs. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Shapes {
  reexport: number;
  global: number;
  globalReexport: number;
  pinnedMulti: number;
  orphan: number;
  unimported: number;
  ambiguous: number;
  invalidExport: number;
  shadowed: number;
}

interface Generated {
  readonly input: VisibilityInput;
  readonly flags: Partial<Record<keyof Shapes, true>>;
}

/**
 * One random multi-module graph, walked by the real walk. Module i imports
 * only modules after it, so the walk finds no import cycle. A global module
 * that re-exports a module it imports closes a cycle through that module,
 * which sees the global's exports.
 */
function generate(random: () => number, graph: number): Generated {
  const flags: Generated['flags'] = {};
  const chance = (p: number): boolean => random() < p;
  const pick = <T>(list: readonly T[]): T | undefined =>
    list[Math.floor(random() * list.length)];

  const plain = Array.from(
    { length: 2 + Math.floor(random() * 3) },
    (_, i) => new Token<IReading>(`G${graph}.Plain${i}`),
  );
  const multi = Array.from(
    { length: 1 + Math.floor(random() * 2) },
    (_, i) => new MultiToken<IReading>(`G${graph}.Multi${i}`),
  );
  // Provided only by a module nothing imports, so the walk never sees it.
  const ghost = new Token<IReading>(`G${graph}.Ghost`);
  const exportable: TokenKey[] = [...plain, ...multi, ghost, REQUEST];

  const count = 2 + Math.floor(random() * 8);
  const definitions: ModuleDefinition[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const later = definitions.slice(); // modules i + 1 .. count - 1
    const imports = later.filter(() => chance(0.4));
    const global = i > 0 && chance(0.2);
    const providers: unknown[] = [];
    const provided = new Set<TokenKey>();
    for (const token of plain)
      if (chance(0.3)) {
        providers.push(provide(token, { useClass: Reading }));
        provided.add(token);
      }
    for (const token of multi) {
      const contributions = chance(0.4) ? 1 + Math.floor(random() * 2) : 0;
      for (let c = 0; c < contributions; c++)
        providers.push(provide(token, { useClass: Reading }));
      if (contributions > 0) provided.add(token);
    }
    // A module mostly exports what it provides, and sometimes a token it
    // may not see.
    const exports: unknown[] = exportable.filter((t) =>
      chance(provided.has(t) ? 0.6 : 0.2),
    );
    for (const imported of imports)
      if (chance(global ? 0.6 : 0.3)) exports.push(imported);
    definitions.unshift(
      defineModule({
        name: `G${graph}.M${i}`,
        global,
        imports,
        providers: providers as never,
        exports: exports as never,
      }),
    );
  }
  // A module nothing imports provides the ghost token, so no record holds it.
  defineModule({
    name: `G${graph}.Unimported`,
    providers: [provide(ghost, { useClass: Reading })],
    exports: [ghost],
  });

  const walked = walk({ root: definitions[0], extraImports: [] }, []);
  let modules: ModuleNode[] = walked.modules.map((m) => ({ ...m }));
  let records: ProviderRecord[] = [...walked.records];

  // Drop one import edge, so the imported module may sit in the list with no
  // importer.
  if (chance(0.25)) {
    const withImports = modules.filter((m) => m.imports.length > 0);
    const from = pick(withImports);
    const to = from === undefined ? undefined : pick(from.imports);
    if (from !== undefined && to !== undefined) {
      modules = modules.map((m) =>
        m === from
          ? {
              ...m,
              imports: m.imports.filter((id) => id !== to),
              exportModules: m.exportModules.filter((id) => id !== to),
            }
          : m,
      );
      if (!modules.some((m) => m.imports.includes(to))) flags.orphan = true;
    }
  }

  const root = modules[0]?.id ?? 'm0';
  const pinned = new Map<TokenKey, readonly string[]>([
    [REQUEST, [REQUEST_ID]],
  ]);
  // A compile.provider hook that pins a MultiToken keeps one contribution.
  const pinnable = multi.find((t) => records.some((r) => r.token === t));
  if (pinnable !== undefined && chance(0.3)) {
    const keep = records.find((r) => r.token === pinnable);
    if (keep !== undefined) {
      records = records.filter((r) => r.token !== pinnable || r === keep);
      pinned.set(pinnable, [keep.id]);
      flags.pinnedMulti = true;
    }
  }
  records.push({
    id: REQUEST_ID,
    index: walked.records.length,
    kind: 'value',
    token: REQUEST,
    module: root,
    name: 'REQUEST',
    lifetime: 'scoped',
    eager: true,
    deps: [],
    props: [],
  });

  for (const m of modules) {
    if (m.exportModules.length > 0) flags.reexport = true;
    if (m.global) {
      flags.global = true;
      if (m.exportModules.length > 0) flags.globalReexport = true;
    }
    if (m.exportTokens.includes(ghost)) flags.unimported = true;
  }

  return { input: { modules, records, pinned }, flags };
}

interface IReading {
  readonly value: number;
}
class Reading implements IReading {
  readonly value = 1;
}

type VisibilityResult = ReturnType<typeof computeVisibility>;

/** Whether a module's own provider of a plain token hides one an import exports. */
function shadows(input: VisibilityInput, result: VisibilityResult): boolean {
  return input.records.some(
    (r) =>
      !(r.token instanceof MultiToken) &&
      input.modules
        .find((m) => m.id === r.module)
        ?.imports.some((id) => result.exportedTokens.get(id)?.has(r.token)) ===
        true,
  );
}

/**
 * A structure two results compare by. Tokens become display names, which
 * are unique per graph. A module with an empty map or set is left out, so
 * the comparison does not depend on whether a pass stores empty entries.
 */
function comparable(result: VisibilityResult, errors: readonly NexusError[]) {
  const names = (tokens: Iterable<TokenKey>): string[] =>
    [...tokens].map((t) => displayName(t)).sort();
  const nonEmpty = <V extends { size: number } | readonly unknown[]>(
    map: ReadonlyMap<string, V>,
  ): [string, V][] =>
    [...map]
      .filter(([, v]) => ('size' in v ? v.size : v.length) > 0)
      .sort(([a], [b]) => a.localeCompare(b));
  return {
    visibility: nonEmpty(result.visibility).map(([id, map]) => [
      id,
      [...map]
        .map(([token, ids]) => [displayName(token), [...ids]] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ]),
    moduleExports: nonEmpty(result.moduleExports),
    exportedTokens: nonEmpty(result.exportedTokens).map(([id, set]) => [
      id,
      names(set),
    ]),
    ambiguous: nonEmpty(result.ambiguous).map(([id, set]) => [id, names(set)]),
    errors: errors
      .map(
        (e) =>
          `${e.constructor.name} ${e.code} ${JSON.stringify(Object.entries(e))}`,
      )
      .sort(),
  };
}

describe('computeVisibility against the dense oracle', () => {
  it(`agrees on ${GRAPHS} generated multi-module graphs`, () => {
    const random = prng(SEED);
    const shapes: Shapes = {
      reexport: 0,
      global: 0,
      globalReexport: 0,
      pinnedMulti: 0,
      orphan: 0,
      unimported: 0,
      ambiguous: 0,
      invalidExport: 0,
      shadowed: 0,
    };
    for (let graph = 0; graph < GRAPHS; graph++) {
      const { input, flags } = generate(random, graph);
      const actualErrors: NexusError[] = [];
      const expectedErrors: NexusError[] = [];
      const actual = comparable(
        computeVisibility(input, actualErrors),
        actualErrors,
      );
      const expected = comparable(
        computeVisibilityOracle(input, expectedErrors),
        expectedErrors,
      );
      expect(actual, `graph ${graph}`).toEqual(expected);

      for (const key of Object.keys(flags) as (keyof Shapes)[]) shapes[key]++;
      if (expectedErrors.some((e) => e.code === 'NEXUS_AMBIGUOUS_PROVIDER'))
        shapes.ambiguous++;
      if (expectedErrors.some((e) => e.code === 'NEXUS_INVALID_EXPORT'))
        shapes.invalidExport++;
      if (shadows(input, computeVisibilityOracle(input, []))) shapes.shadowed++;
    }
    // Each shape the generator aims for shows up in a fair share of graphs.
    for (const [shape, seen] of Object.entries(shapes))
      expect(seen, shape).toBeGreaterThanOrEqual(GRAPHS / 20);
  });
});
