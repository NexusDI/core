/**
 * needle-di `decorated` (scale spec 4.2): `@injectable()` classes with an
 * `inject(id)` initializer per dependency field, bound on first `get`;
 * factories as `{ provide, useFactory }` and values as
 * `{ provide, useValue }` under an InjectionToken; async factories as
 * `{ provide, async: true, useFactory }`, resolved with `getAsync`. Each
 * graph module with factories or values is a `register<Module>(container)`
 * function making one `container.bindAll(...)` call (ruling 6), the
 * departure libraries.json records. Classes and the value token follow
 * fixtures/needle-di/decorated.ts; factories and async injection follow
 * the pages the header cites.
 */
import type { ScaleGraph, ScaleProvider } from '../graph.ts';
import {
  classBody,
  className,
  counterImport,
  factoryBody,
  iface,
  layout,
  moduleBody,
  ownOf,
  perClass,
  token,
  tokenTable,
  valueLiteral,
  type Files,
  typeOf,
  registerOf,
  fileOf,
  lineOf,
} from './shared.ts';

const PKG = '@needle-di/core';

const header = (graph: ScaleGraph) =>
  `// Scale app: ${graph.shape} at ${graph.size} providers, needle-di decorated.
// Docs: https://needle-di.io (1.2.1), pages Injection, Tokens, Providers,
// Binding and Async injection, read 2026-10-01.
// needle-di documents singletons only, so no lifetime is set.
// A factory injects its dependencies with inject(). inject() throws for an
// async provider, also an indirect one, and works only before the first
// await, so a factory whose closure holds an async provider is bound
// async: true, injects its other dependencies first and then awaits
// container.getAsync for each dependency that reaches one. A sync factory
// bound this way does no other await.
// Departures: initializer injection, which the Injection page documents;
// it recommends constructor parameter properties, which Node's type
// stripping rejects.${
    perClass(graph)
      ? ''
      : '\n// needle-di documents no module unit, so each graph module with\n// factories or values is a register<Module>(container) function making\n// one container.bindAll(...) call; create calls them in module order.'
  }
// Every class binds on first get.
`;

/** The id a dependant injects: the class itself, or the provider's token. */
const idOf = (p: ScaleProvider) =>
  p.kind === 'class' ? className(p) : token(p);

/** The type dependants take: the class, a factory's product, or the value's interface. */
/** registerM0 for module m0. */
/** The file that declares a provider's class. */
/**
 * The providers whose closure holds an async factory, themselves
 * included. needle-di constructs a sync factory synchronously, so an
 * inject() anywhere below it throws on an async provider and only a class
 * gets getAsync's retry: every factory in this set is bound async, and a
 * dependency in it is awaited with getAsync.
 */
function asyncClosures(graph: ScaleGraph): Set<number> {
  const reaches = new Set<number>();
  for (const p of graph.providers)
    if (p.kind === 'async-factory' || p.deps.some((d) => reaches.has(d)))
      reaches.add(p.index);
  return reaches;
}

/** A class provider's class, or a factory's product class. */
function classOf(graph: ScaleGraph, p: ScaleProvider): string {
  const bound = p.kind === 'class';
  return `${bound ? '@injectable()\n' : ''}export class ${className(p)} {\n${classBody(
    graph,
    p,
    {
      param: typeOf,
      report: bound,
      initializer: bound ? (d) => `inject(${idOf(d)})` : undefined,
    },
  )}}\n`;
}

/** One provider's entry in a bindAll call. */
function entryOf(
  graph: ScaleGraph,
  p: ScaleProvider,
  async: ReadonlySet<number>,
): string {
  if (p.kind === 'value')
    return `    { provide: ${token(p)}, useValue: ${valueLiteral(p)} },\n`;
  const deps = p.deps.map((d) => graph.providers[d]);
  if (async.has(p.index)) {
    // inject() works only before the first await, so dependencies with no
    // async closure come first; the others are awaited in order.
    const injected = deps
      .map((d, i) => [d, i] as const)
      .filter(([d]) => !async.has(d.index));
    const awaited = deps
      .map((d, i) => [d, i] as const)
      .filter(([d]) => async.has(d.index));
    const binds = [
      ...injected.map(
        ([d, i]) => `        const d${i} = inject(${idOf(d)});\n`,
      ),
      ...awaited.map(
        ([d, i]) => `        const d${i} = await c.getAsync(${idOf(d)});\n`,
      ),
    ].join('');
    return `    {
      provide: ${token(p)},
      async: true,
      useFactory: async (${awaited.length > 0 ? 'c: Container' : ''}): Promise<${className(p)}> => {
${binds}${factoryBody(p, '        ')}      },
    },\n`;
  }
  const binds = deps
    .map((d, i) => `        const d${i} = inject(${idOf(d)});\n`)
    .join('');
  return `    {
      provide: ${token(p)},
      useFactory: (): ${className(p)} => {
${binds}${factoryBody(p, '        ')}      },
    },\n`;
}

/**
 * The imports of `own`'s classes and bindings that `here` does not
 * declare: a class from its file when a field or factory injects it or a
 * product constructor takes it, a token (and a value's interface) from
 * tokens.ts.
 */
function depImports(
  graph: ScaleGraph,
  own: readonly ScaleProvider[],
  here: (p: ScaleProvider) => boolean,
): string {
  const tokens = new Set<number>();
  const types = new Set<number>();
  const classes = new Set<number>();
  for (const p of own) {
    if (p.kind !== 'class') tokens.add(p.index);
    for (const d of p.deps) {
      const dep = graph.providers[d];
      if (dep.kind === 'class') classes.add(d);
      else tokens.add(d);
      // A factory's product constructor names its parameters' types.
      if (p.kind !== 'class') (dep.kind === 'value' ? types : classes).add(d);
    }
  }
  const byFile = new Map<string, string[]>();
  for (const i of [...classes].sort((a, b) => a - b)) {
    const p = graph.providers[i];
    if (here(p)) continue;
    const file = fileOf(graph, p);
    byFile.set(file, [...(byFile.get(file) ?? []), className(p)]);
  }
  const fromTokens = [...new Set([...tokens, ...types])]
    .sort((a, b) => a - b)
    .flatMap((i) => {
      const p = graph.providers[i];
      return [
        ...(tokens.has(i) ? [token(p)] : []),
        ...(types.has(i) ? [`type ${iface(p)}`] : []),
      ];
    });
  return `${[...byFile.keys()]
    .sort()
    .map((f) => lineOf(byFile.get(f) ?? [], `./${f}`))
    .join('')}${lineOf(fromTokens, './tokens.ts')}`;
}

/** The needle-di names a file's classes and bindings use. */
function needleNames(
  own: readonly ScaleProvider[],
  async: ReadonlySet<number>,
): string[] {
  const classes = own.filter((p) => p.kind === 'class');
  const bound = own.filter((p) => p.kind !== 'class');
  const injects =
    classes.some((p) => p.deps.length > 0) ||
    bound.some((p) => p.deps.some((d) => !async.has(d)));
  return [
    ...(bound.length > 0 ? ['type Container'] : []),
    ...(injects ? ['inject'] : []),
    ...(classes.length > 0 ? ['injectable'] : []),
  ];
}

/** tokens.ts: an InjectionToken per factory and value, an interface per value. */
function tokensFile(graph: ScaleGraph): string {
  const bound = graph.providers.filter((p) => p.kind !== 'class');
  const products = new Map<string, string[]>();
  for (const p of bound.filter((q) => q.kind !== 'value')) {
    const file = fileOf(graph, p);
    products.set(file, [...(products.get(file) ?? []), className(p)]);
  }
  const imports = [...products.keys()]
    .sort()
    .map((f) => lineOf(products.get(f) ?? [], `./${f}`, true))
    .join('');
  return `import { InjectionToken } from '${PKG}';

${imports}${imports === '' ? '' : '\n'}${bound
    .map(
      (p) =>
        `${
          p.kind === 'value'
            ? `export interface ${iface(p)} {\n  readonly id: '${p.name}';\n}\n`
            : ''
        }export const ${token(p)} = new InjectionToken<${typeOf(p)}>('${p.name}');\n`,
    )
    .join('')}`;
}

/** Whether a module binds anything through its register function. */
const hasBindings = (graph: ScaleGraph, k: number) =>
  ownOf(graph, k).some((p) => p.kind !== 'class');

/** One file per module: its classes and, when it binds any, its register function. */
function moduleFile(
  graph: ScaleGraph,
  k: number,
  async: ReadonlySet<number>,
): string {
  const m = graph.modules[k];
  const own = ownOf(graph, k);
  const here = (p: ScaleProvider) => p.module === k;
  const register = hasBindings(graph, k)
    ? `export function ${registerOf(m.name)}(container: Container): void {
  container.bindAll(
${own
  .filter((p) => p.kind !== 'class')
  .map((p) => entryOf(graph, p, async))
  .join('')}  );
}
`
    : '';
  // A module of classes alone ends on its last class.
  return `${lineOf(needleNames(own, async), PKG)}
${moduleBody(own, depImports(graph, own, here), (p) => classOf(graph, p))}${register}`.replace(
    /\n+$/,
    '\n',
  );
}

/** One file per class, as scale-200: the class alone. */
function classFile(graph: ScaleGraph, p: ScaleProvider): string {
  return `${lineOf(needleNames([p], new Set()), PKG)}
${counterImport(['__scaleBuilt'])}${depImports(graph, [p], (q) => q.index === p.index)}
${classOf(graph, p)}`;
}

/** The token table, the container setup and the adapter. */
function appFile(graph: ScaleGraph, async: ReadonlySet<number>): string {
  const { providers, modules } = graph;
  const byFile = new Map<string, string[]>();
  const add = (file: string, name: string) =>
    byFile.set(file, [...(byFile.get(file) ?? []), name]);
  for (const p of providers.filter((q) => q.kind === 'class'))
    add(fileOf(graph, p), className(p));
  const registered = perClass(graph)
    ? []
    : modules.filter((_, k) => hasBindings(graph, k));
  for (const m of registered) add(`${m.name}.ts`, registerOf(m.name));
  const tokens = providers.filter((p) => p.kind !== 'class').map(token);
  const create =
    registered.length === 0
      ? '  create: (): Container => new Container(),\n'
      : `  create: (): Container => {
    const container = new Container();
${registered.map((m) => `    ${registerOf(m.name)}(container);\n`).join('')}    return container;
  },
`;
  return `${header(graph)}${lineOf(['Container', 'type Token'], PKG)}
${counterImport(['built'])}${[...byFile.keys()]
    .sort()
    .map((f) => lineOf(byFile.get(f) ?? [], `./${f}`))
    .join('')}${lineOf(tokens, './tokens.ts')}
${tokenTable('Token<unknown>', providers.map(idOf))}
export const scale = {
  count: ${providers.length},
  entries: [${graph.entries.join(', ')}],
  target: ${graph.target},
  packages: ['${PKG}'],
  built,
${create}  get: (handle: Container, index: number): unknown => handle.get(T[index]),
${
  async.size > 0
    ? `  getAsync: (handle: Container, index: number): Promise<unknown> =>
    handle.getAsync(T[index]),
`
    : ''
}};
`;
}

export function renderNeedleDi(graph: ScaleGraph): Files {
  if (perClass(graph) && graph.providers.some((p) => p.kind !== 'class'))
    throw new Error(`${graph.shape} renders classes only`);
  const async = asyncClosures(graph);
  const tokens = tokensFile(graph);
  return layout(graph, {
    app: appFile(graph, async),
    tokens: graph.providers.every((p) => p.kind === 'class')
      ? undefined
      : tokens,
    classFile: (p) => classFile(graph, p),
    moduleFile: (k) => moduleFile(graph, k, async),
  });
}
