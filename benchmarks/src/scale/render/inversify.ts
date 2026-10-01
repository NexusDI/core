/**
 * InversifyJS `decorated` (scale spec 4.2): `@injectable()` classes with
 * `@inject(id)` on every constructor parameter, bound with
 * `bind(C).toSelf().inSingletonScope()`; factories as
 * `toResolvedValue(fn, [ids]).inSingletonScope()` under a symbol; values
 * as `toConstantValue` under a symbol; one `ContainerModule` per graph
 * module, loaded with the synchronous `container.load`. Class and symbol
 * ids follow fixtures/inversify/decorated.ts; modules and async factories
 * follow the pages the header cites.
 */
import type { ScaleGraph, ScaleProvider } from '../graph.ts';
import {
  classBody,
  className,
  counterImport,
  factoryFunction,
  hasFactories,
  iface,
  isAsync,
  layout,
  moduleBody,
  moduleConst,
  ownOf,
  perClass,
  token,
  valueLiteral,
  type Files,
} from './shared.ts';

const header = (graph: ScaleGraph) =>
  `// Scale app: ${graph.shape} at ${graph.size} providers, InversifyJS decorated.
// Docs: https://inversify.io/docs/introduction/getting-started/ (8.2.3),
// https://inversify.io/docs/api/container-module/,
// https://inversify.io/docs/api/binding-syntax/#toresolvedvalue and
// https://inversify.io/docs/api/container/#getasync, read 2026-10-01.
// Every binding is a singleton, since InversifyJS defaults to transient.
// Departures: fields for dependencies, because Node's type stripping
// rejects parameter properties.
`;

/** The service identifier: the class itself, or the provider's symbol. */
const idOf = (p: ScaleProvider) =>
  p.kind === 'class' ? className(p) : token(p);

/** The type dependants take: the class, a factory's product, or the value's interface. */
const typeOf = (p: ScaleProvider) =>
  p.kind === 'value' ? iface(p) : className(p);

/** Names a file refers to: providers whose id or type it uses. */
interface Refs {
  ids: Set<number>;
  types: Set<number>;
}

const refs = (): Refs => ({ ids: new Set(), types: new Set() });

/** The ids and types the classes and bindings of `own` use. */
function refsOf(
  graph: ScaleGraph,
  own: readonly ScaleProvider[],
  opts: { classes: boolean; bindings: boolean },
): Refs {
  const r = refs();
  for (const p of own) {
    if (opts.bindings) {
      r.ids.add(p.index);
      if (p.kind !== 'class') r.types.add(p.index);
    }
    // @inject ids sit in the class; resolved-value ids in the binding.
    const injects =
      p.kind === 'class' ? opts.classes : p.kind !== 'value' && opts.bindings;
    for (const d of p.deps) {
      if (injects) r.ids.add(d);
      if (opts.classes || injects) r.types.add(d);
    }
  }
  return r;
}

/**
 * The import lines for `r`, leaving out what `here` declares: classes
 * from the file that declares them, symbols and value interfaces from
 * tokens.ts.
 */
function importsOf(
  graph: ScaleGraph,
  r: Refs,
  here: (p: ScaleProvider) => boolean,
  extra: ReadonlyMap<string, string[]> = new Map(),
): string {
  const byFile = new Map<string, string[]>(
    [...extra].map(([f, names]) => [f, [...names]]),
  );
  const add = (file: string, name: string) => {
    const names = byFile.get(file) ?? [];
    if (!names.includes(name)) names.push(name);
    byFile.set(file, names);
  };
  const tokens: string[] = [];
  const all = [...new Set([...r.ids, ...r.types])].sort((a, b) => a - b);
  for (const i of all) {
    const p = graph.providers[i];
    if (p.kind !== 'class' && r.ids.has(i)) tokens.push(token(p));
    if (p.kind === 'value') {
      if (r.types.has(i)) tokens.push(`type ${iface(p)}`);
      continue;
    }
    if (here(p)) continue;
    if (p.kind === 'class' ? r.ids.has(i) || r.types.has(i) : r.types.has(i))
      add(fileOf(graph, p), className(p));
  }
  const files = [...byFile.keys()].sort();
  const local = files
    .map((f) => lineOf(byFile.get(f) ?? [], `./${f}`))
    .join('');
  return `${local}${lineOf(tokens, './tokens.ts')}`;
}

function lineOf(names: readonly string[], from: string): string {
  if (names.length === 0) return '';
  const one = `import { ${names.join(', ')} } from '${from}';\n`;
  if (one.length <= 81) return one;
  return `import {\n${names.map((n) => `  ${n},\n`).join('')}} from '${from}';\n`;
}

/** The file that declares a provider's class. */
const fileOf = (graph: ScaleGraph, p: ScaleProvider) =>
  perClass(graph) ? `${p.name}.ts` : `${graph.modules[p.module].name}.ts`;

/** A class provider's class, or a factory's product class. */
function classOf(graph: ScaleGraph, p: ScaleProvider): string {
  const bound = p.kind === 'class';
  return `${bound ? '@injectable()\n' : ''}export class ${className(p)} {\n${classBody(
    graph,
    p,
    {
      param: typeOf,
      report: bound,
      decorate: bound ? (d) => `@inject(${idOf(d)}) ` : undefined,
    },
  )}}\n`;
}

/** One provider's binding statement, `bind` being the bind function. */
function bindingOf(
  graph: ScaleGraph,
  p: ScaleProvider,
  bind: string,
  indent: string,
): string {
  if (p.kind === 'class')
    return `${indent}${bind}(${className(p)}).toSelf().inSingletonScope();\n`;
  if (p.kind === 'value')
    return `${indent}${bind}<${iface(p)}>(${token(p)}).toConstantValue(${valueLiteral(p)});\n`;
  const ids =
    p.deps.length > 0
      ? `${indent}    [${p.deps.map((d) => idOf(graph.providers[d])).join(', ')}],\n`
      : '';
  return `${indent}${bind}<${className(p)}>(${token(p)})
${indent}  .toResolvedValue(
${indent}    ${factoryFunction(graph, p, { param: typeOf, product: className(p), indent: `${indent}    ` })},
${ids}${indent}  )
${indent}  .inSingletonScope();\n`;
}

function inversifyImport(names: readonly string[]): string {
  return names.length === 0 ? '' : lineOf(names, 'inversify');
}

/** The decorators a file's classes use. */
function decorators(own: readonly ScaleProvider[]): string[] {
  const classes = own.filter((p) => p.kind === 'class');
  return [
    ...(classes.some((p) => p.deps.length > 0) ? ['inject'] : []),
    ...(classes.length > 0 ? ['injectable'] : []),
  ];
}

/** tokens.ts: a symbol per factory and value, an interface per value. */
function tokensFile(graph: ScaleGraph): string {
  return graph.providers
    .filter((p) => p.kind !== 'class')
    .map(
      (p) =>
        `${
          p.kind === 'value'
            ? `export interface ${iface(p)} {\n  readonly id: '${p.name}';\n}\n`
            : ''
        }export const ${token(p)} = Symbol.for('${p.name}');\n`,
    )
    .join('');
}

/** One file per module: its classes and its ContainerModule. */
function moduleFile(graph: ScaleGraph, k: number): string {
  const m = graph.modules[k];
  const own = ownOf(graph, k);
  const here = (p: ScaleProvider) => p.module === k;
  return `${inversifyImport([
    'ContainerModule',
    'type ContainerModuleLoadOptions',
    ...decorators(own),
  ])}
${moduleBody(
  own,
  importsOf(graph, refsOf(graph, own, { classes: true, bindings: true }), here),
  (p) => classOf(graph, p),
)}export const ${moduleConst(m.name)} = new ContainerModule(
  (options: ContainerModuleLoadOptions) => {
${own.map((p) => bindingOf(graph, p, 'options.bind', '    ')).join('')}  },
);
`;
}

/** One file per class, as scale-200: the class alone. */
function classFile(graph: ScaleGraph, p: ScaleProvider): string {
  const imports = importsOf(
    graph,
    refsOf(graph, [p], { classes: true, bindings: false }),
    (q) => q.index === p.index,
  );
  return `${inversifyImport(decorators([p]))}${counterImport(
    p.kind === 'class' ? ['__scaleBuilt'] : [],
  )}${imports}
${classOf(graph, p)}`;
}

/** The token table, the container setup and the adapter. */
function appFile(graph: ScaleGraph): string {
  const { providers, modules } = graph;
  const split = perClass(graph);
  const async = providers.some(isAsync);
  const factories = hasFactories(graph);
  // The table names every provider; with one class per file the bindings
  // sit here too, as scale-200's main.ts holds them.
  const r = split
    ? refsOf(graph, providers, { classes: false, bindings: true })
    : { ids: new Set(providers.map((p) => p.index)), types: new Set<number>() };
  const moduleConsts = new Map(
    split ? [] : modules.map((m) => [`${m.name}.ts`, [moduleConst(m.name)]]),
  );
  const setup = split
    ? providers
        .map((p) => bindingOf(graph, p, 'container.bind', '    '))
        .join('')
    : `    container.load(${modules.map((m) => moduleConst(m.name)).join(', ')});\n`;
  return `${header(graph)}${inversifyImport([
    'Container',
    'type ServiceIdentifier',
  ])}
${counterImport(split && factories ? ['__scaleBuilt', 'built'] : ['built'])}${importsOf(
    graph,
    r,
    () => false,
    moduleConsts,
  )}
const T: readonly ServiceIdentifier[] = [
${providers.map((p) => `  ${idOf(p)},\n`).join('')}];

export const scale = {
  count: ${providers.length},
  entries: [${graph.entries.join(', ')}],
  target: ${graph.target},
  packages: ['inversify'],
  built,
  create: (): Container => {
    const container = new Container();
${setup}    return container;
  },
  get: (handle: Container, index: number): unknown => handle.get(T[index]),
${
  async
    ? `  getAsync: (handle: Container, index: number): Promise<unknown> =>
    handle.getAsync(T[index]),
`
    : ''
}};
`;
}

export function renderInversify(graph: ScaleGraph): Files {
  const tokens = tokensFile(graph);
  return layout(graph, {
    app: appFile(graph),
    tokens: tokens === '' ? undefined : tokens,
    classFile: (p) => classFile(graph, p),
    moduleFile: (k) => moduleFile(graph, k),
  });
}
