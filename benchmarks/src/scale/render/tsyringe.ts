/**
 * tsyringe `decorated` (scale spec 4.2): `@singleton()` classes whose
 * constructor types name their class dependencies, `@inject('<name>')` on
 * a parameter that takes a factory or a value; factories as
 * `{ token, useFactory: instanceCachingFactory(...) }` and values as
 * `{ token, useValue }` under string tokens, in one `@registry([...])`
 * class per graph module (ruling 6). Classes and the string token follow
 * fixtures/tsyringe/decorated.ts; the registry and the caching factory
 * follow the README sections the header cites. tsyringe has no async
 * resolution, so an async graph is not-applicable (ruling 7) and never
 * reaches this renderer.
 */
import type { ScaleGraph, ScaleProvider } from '../graph.ts';
import {
  classBody,
  className,
  counterImport,
  factoryBody,
  iface,
  isAsync,
  layout,
  moduleBody,
  moduleConst,
  ownOf,
  perClass,
  tokenTable,
  valueLiteral,
  type Files,
} from './shared.ts';

const header = (graph: ScaleGraph) =>
  `// Scale app: ${graph.shape} at ${graph.size} providers, tsyringe decorated.
// Docs: https://github.com/microsoft/tsyringe#readme (4.10.0), sections
// singleton(), inject(), Factory provider, instanceCachingFactory and
// Registry, read 2026-10-01.
// Every class is @singleton() and every factory instanceCachingFactory,
// since tsyringe defaults to transient. Factories and values register
// under string tokens, as the Meridian-8 fixture registers NavCharts.
// Each graph module with factories or values is one @registry([...])
// class. tsyringe has no module visibility, so the global container is
// flat and every registration is visible everywhere.
// create returns the global container: @singleton() and @registry
// register when their files load.
// Departures: fields for dependencies, because Node's type stripping
// rejects parameter properties.
`;

/** The token a factory or value registers under. */
const tokenOf = (p: ScaleProvider) => `'${p.name}'`;

/** The type dependants take: the class, a factory's product, or the value's interface. */
const typeOf = (p: ScaleProvider) =>
  p.kind === 'value' ? iface(p) : className(p);

/** The file that declares a provider's class or value interface. */
const fileOf = (graph: ScaleGraph, p: ScaleProvider) =>
  perClass(graph) ? `${p.name}.ts` : `${graph.modules[p.module].name}.ts`;

function lineOf(names: readonly string[], from: string): string {
  if (names.length === 0) return '';
  const one = `import { ${names.join(', ')} } from '${from}';\n`;
  if (one.length <= 81) return one;
  return `import {\n${names.map((n) => `  ${n},\n`).join('')}} from '${from}';\n`;
}

/**
 * The imports of the dependencies of `own` that `here` does not declare:
 * a class by name, a value's interface as a type, from its file.
 */
function depImports(
  graph: ScaleGraph,
  own: readonly ScaleProvider[],
  here: (p: ScaleProvider) => boolean,
): string {
  const used = [...new Set(own.flatMap((p) => p.deps))].sort((a, b) => a - b);
  const byFile = new Map<string, string[]>();
  for (const i of used) {
    const p = graph.providers[i];
    if (here(p)) continue;
    const file = fileOf(graph, p);
    byFile.set(file, [
      ...(byFile.get(file) ?? []),
      p.kind === 'value' ? `type ${iface(p)}` : className(p),
    ]);
  }
  return [...byFile.keys()]
    .sort()
    .map((f) => lineOf(byFile.get(f) ?? [], `./${f}`))
    .join('');
}

/** A class provider's class, or a factory's product class. */
function classOf(graph: ScaleGraph, p: ScaleProvider): string {
  const bound = p.kind === 'class';
  return `${bound ? '@singleton()\n' : ''}export class ${className(p)} {\n${classBody(
    graph,
    p,
    {
      param: typeOf,
      report: bound,
      decorate: bound
        ? (d) => (d.kind === 'class' ? '' : `@inject(${tokenOf(d)}) `)
        : undefined,
    },
  )}}\n`;
}

/** A dependency's resolve call inside a factory. */
const resolveOf = (d: ScaleProvider) =>
  d.kind === 'class'
    ? `c.resolve(${className(d)})`
    : `c.resolve<${typeOf(d)}>(${tokenOf(d)})`;

/** One registry entry, indented for the registry array. */
function entryOf(graph: ScaleGraph, p: ScaleProvider): string {
  if (p.kind === 'value')
    return `  { token: ${tokenOf(p)}, useValue: ${valueLiteral(p)} },\n`;
  const binds = p.deps
    .map((d, i) => `      const d${i} = ${resolveOf(graph.providers[d])};\n`)
    .join('');
  return `  {
    token: ${tokenOf(p)},
    useFactory: instanceCachingFactory<${className(p)}>((c) => {
${binds}${factoryBody(p, '      ')}    }),
  },\n`;
}

/** The tsyringe names a file's classes and registry use. */
function tsyringeNames(own: readonly ScaleProvider[]): string[] {
  const classes = own.filter((p) => p.kind === 'class');
  const registered = own.filter((p) => p.kind !== 'class');
  const injects = classes.some((p) => p.deps.length > 0);
  return [
    ...(injects ? ['inject'] : []),
    ...(registered.some((p) => p.kind === 'factory')
      ? ['instanceCachingFactory']
      : []),
    ...(registered.length > 0 ? ['registry'] : []),
    ...(classes.length > 0 ? ['singleton'] : []),
  ];
}

/** Whether a module registers anything through its @registry class. */
const hasRegistry = (graph: ScaleGraph, k: number) =>
  ownOf(graph, k).some((p) => p.kind !== 'class');

/**
 * One file per module: its value interfaces, its classes and, when it
 * holds factories or values, its @registry class.
 */
function moduleFile(graph: ScaleGraph, k: number): string {
  const m = graph.modules[k];
  const own = ownOf(graph, k);
  const here = (p: ScaleProvider) => p.module === k;
  const values = own
    .filter((p) => p.kind === 'value')
    .map(
      (p) => `export interface ${iface(p)} {\n  readonly id: '${p.name}';\n}\n`,
    )
    .join('');
  const registry = hasRegistry(graph, k)
    ? `@registry([
${own
  .filter((p) => p.kind !== 'class')
  .map((p) => entryOf(graph, p))
  .join('')}])
export class ${moduleConst(m.name)} {}
`
    : '';
  const imports = depImports(graph, own, here);
  const body = moduleBody(
    own,
    values === '' ? imports : `${imports}\n${values}`,
    (p) => classOf(graph, p),
  );
  // A module of classes alone ends on its last class.
  return `${lineOf(tsyringeNames(own), 'tsyringe')}\n${body}${registry}`.replace(
    /\n+$/,
    '\n',
  );
}

/** One file per class, as scale-200: the class alone. */
function classFile(graph: ScaleGraph, p: ScaleProvider): string {
  return `${lineOf(tsyringeNames([p]), 'tsyringe')}\n${counterImport(['__scaleBuilt'])}${depImports(
    graph,
    [p],
    (q) => q.index === p.index,
  )}
${classOf(graph, p)}`;
}

/**
 * The imports app.ts needs: the class providers the token table names,
 * from their files, and a bare import of a module file whose registry
 * would otherwise never load.
 */
function appImports(graph: ScaleGraph): string {
  const byFile = new Map<string, string[]>();
  for (const p of graph.providers.filter((q) => q.kind === 'class')) {
    const file = fileOf(graph, p);
    byFile.set(file, [...(byFile.get(file) ?? []), className(p)]);
  }
  if (!perClass(graph))
    graph.modules.forEach((m, k) => {
      const file = `${m.name}.ts`;
      if (hasRegistry(graph, k) && !byFile.has(file)) byFile.set(file, []);
    });
  return [...byFile.keys()]
    .sort()
    .map((f) => {
      const names = byFile.get(f) ?? [];
      return names.length === 0
        ? `import './${f}';\n`
        : lineOf(names, `./${f}`);
    })
    .join('');
}

/** The token table and the adapter. */
function appFile(graph: ScaleGraph): string {
  const { providers } = graph;
  return `${header(graph)}import 'reflect-metadata';
${lineOf(['container', 'type DependencyContainer', 'type InjectionToken'], 'tsyringe')}
${counterImport(['built'])}${appImports(graph)}
${tokenTable(
  'InjectionToken',
  providers.map((p) => (p.kind === 'class' ? className(p) : tokenOf(p))),
)}
export const scale = {
  count: ${providers.length},
  entries: [${graph.entries.join(', ')}],
  target: ${graph.target},
  packages: ['reflect-metadata', 'tsyringe'],
  built,
  create: (): DependencyContainer => container,
  get: (handle: DependencyContainer, index: number): unknown =>
    handle.resolve(T[index]),
};
`;
}

export function renderTsyringe(graph: ScaleGraph): Files {
  if (graph.providers.some(isAsync))
    throw new Error(
      'tsyringe has no async resolution; an async graph is not-applicable',
    );
  if (perClass(graph) && graph.providers.some((p) => p.kind !== 'class'))
    throw new Error(`${graph.shape} renders classes only`);
  return layout(graph, {
    app: appFile(graph),
    classFile: (p) => classFile(graph, p),
    moduleFile: (k) => moduleFile(graph, k),
  });
}
