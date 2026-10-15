/**
 * awilix `plain` (scale spec 4.2): plain classes whose constructors
 * destructure the PROXY cradle, `asClass(C).singleton()`,
 * `asFunction(fn).singleton()` for factories and `asValue` for values,
 * under cradle names; `createContainer` with PROXY injection and
 * `strict: true`. Each graph module is a `register<Module>(container)`
 * function making one `container.register({...})` call (ruling 6), the
 * departure libraries.json records. Classes, values and the container
 * options follow fixtures/awilix/plain.ts; factories follow the README
 * section the header cites. awilix resolves synchronously, so an async
 * graph is not-applicable (ruling 7) and never reaches this renderer.
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
  ownOf,
  perClass,
  valueLiteral,
  type Files,
  typeOf,
  registerOf,
  fileOf,
  lineOf,
} from './shared.ts';

const header = (graph: ScaleGraph) =>
  `// Scale app: ${graph.shape} at ${graph.size} providers, awilix plain.
// Docs: https://github.com/jeffijoe/awilix#readme (13.0.5), sections
// Injection modes, asFunction(), asClass(), asValue() and
// container.register(), read 2026-10-01.
// PROXY injection and strict mode, as the Meridian-8 fixture sets them;
// the README warns that CLASSIC breaks under minification.
// Every registration is .singleton(), since awilix defaults to transient.
// Constructors and factories take the cradle and rename the names they
// destructure to d0, d1, ...
${
  perClass(graph)
    ? "// create registers every class in one container.register({...}) call,\n// as the fixture does.\n// Departures: fields for dependencies, because Node's type stripping\n// rejects parameter properties.\n"
    : "// Departures: fields for dependencies, because Node's type stripping\n// rejects parameter properties. awilix documents no module unit, so each\n// graph module is a register<Module>(container) function making one\n// container.register({...}) call; create calls them in module order.\n"
}`;

/**
 * The type imports a file needs for the dependencies of `own` that
 * `here` does not declare, plus `Cradle` when `cradle` is set: classes
 * from their files, value interfaces and the cradle from cradle.ts.
 */
function typeImports(
  graph: ScaleGraph,
  own: readonly ScaleProvider[],
  here: (p: ScaleProvider) => boolean,
  cradle: boolean,
): string {
  const used = [...new Set(own.flatMap((p) => p.deps))].sort((a, b) => a - b);
  const byFile = new Map<string, string[]>(
    cradle ? [['cradle.ts', ['Cradle']]] : [],
  );
  for (const i of used) {
    const p = graph.providers[i];
    // A value's interface lives in cradle.ts, whichever module binds it.
    if (p.kind !== 'value' && here(p)) continue;
    const file = p.kind === 'value' ? 'cradle.ts' : fileOf(graph, p);
    byFile.set(file, [...(byFile.get(file) ?? []), typeOf(p)]);
  }
  return [...byFile.keys()]
    .sort()
    .map((f) => lineOf(byFile.get(f) ?? [], `./${f}`, true))
    .join('');
}

/** `{ p0: d0, p1: d1 }: Cradle`, the destructured cradle of a provider. */
const cradleParam = (graph: ScaleGraph, p: ScaleProvider) =>
  `{ ${p.deps.map((d, i) => `${graph.providers[d].name}: d${i}`).join(', ')} }: Cradle`;

/** A class provider's class, or a factory's product class. */
function classOf(graph: ScaleGraph, p: ScaleProvider): string {
  const bound = p.kind === 'class';
  return `export class ${className(p)} {\n${classBody(graph, p, {
    param: typeOf,
    report: bound,
    params: bound ? cradleParam(graph, p) : undefined,
  })}}\n`;
}

/** One provider's entry in a container.register({...}) call. */
function entryOf(graph: ScaleGraph, p: ScaleProvider, indent: string): string {
  if (p.kind === 'class')
    return `${indent}${p.name}: asClass(${className(p)}).singleton(),\n`;
  if (p.kind === 'value')
    return `${indent}${p.name}: asValue(${valueLiteral(p)}),\n`;
  const param = p.deps.length > 0 ? cradleParam(graph, p) : '';
  return `${indent}${p.name}: asFunction((${param}): ${className(p)} => {
${factoryBody(p, `${indent}  `)}${indent}}).singleton(),\n`;
}

/** The awilix resolver functions `own`'s entries call. */
const resolvers = (own: readonly ScaleProvider[]) => [
  ...(own.some((p) => p.kind === 'class') ? ['asClass'] : []),
  ...(own.some((p) => p.kind === 'factory') ? ['asFunction'] : []),
  ...(own.some((p) => p.kind === 'value') ? ['asValue'] : []),
];

/** cradle.ts: an interface per value and the cradle, one name per provider. */
function cradleFile(graph: ScaleGraph): string {
  const byFile = new Map<string, string[]>();
  for (const p of graph.providers.filter((q) => q.kind !== 'value')) {
    const file = fileOf(graph, p);
    byFile.set(file, [...(byFile.get(file) ?? []), className(p)]);
  }
  const imports = [...byFile.keys()]
    .sort()
    .map((f) => lineOf(byFile.get(f) ?? [], `./${f}`, true))
    .join('');
  const values = graph.providers
    .filter((p) => p.kind === 'value')
    .map(
      (p) =>
        `export interface ${iface(p)} {\n  readonly id: '${p.name}';\n}\n\n`,
    )
    .join('');
  return `${imports}${imports === '' ? '' : '\n'}${values}/** Every registration by name, as the PROXY cradle resolves it. */
export interface Cradle {
${graph.providers.map((p) => `  ${p.name}: ${typeOf(p)};\n`).join('')}}
`;
}

/** One file per module: its classes and its register function. */
function moduleFile(graph: ScaleGraph, k: number): string {
  const m = graph.modules[k];
  const own = ownOf(graph, k);
  const here = (p: ScaleProvider) => p.module === k;
  return `${lineOf([...resolvers(own), 'type AwilixContainer'], 'awilix')}
${moduleBody(own, typeImports(graph, own, here, true), (p) =>
  classOf(graph, p),
)}export function ${registerOf(m.name)}(container: AwilixContainer<Cradle>): void {
  container.register({
${own.map((p) => entryOf(graph, p, '    ')).join('')}  });
}
`;
}

/** One file per class, as scale-200: the class alone. */
function classFile(graph: ScaleGraph, p: ScaleProvider): string {
  const imports = typeImports(
    graph,
    [p],
    (q) => q.index === p.index,
    p.deps.length > 0,
  );
  return `${counterImport(['__scaleBuilt'])}${imports}
${classOf(graph, p)}`;
}

/** The token table, the container setup and the adapter. */
function appFile(graph: ScaleGraph): string {
  const { providers, modules } = graph;
  const split = perClass(graph);
  const local = split
    ? [...providers]
        .sort((a, b) => fileOf(graph, a).localeCompare(fileOf(graph, b)))
        .map((p) => lineOf([className(p)], `./${fileOf(graph, p)}`))
        .join('')
    : modules
        .map((m) => lineOf([registerOf(m.name)], `./${m.name}.ts`))
        .join('');
  const setup = split
    ? `    container.register({
${providers.map((p) => entryOf(graph, p, '      ')).join('')}    });
`
    : modules.map((m) => `    ${registerOf(m.name)}(container);\n`).join('');
  return `${header(graph)}${lineOf(
    [
      'InjectionMode',
      ...(split ? resolvers(providers) : []),
      'createContainer',
      'type AwilixContainer',
    ],
    'awilix',
  )}
${counterImport(['built'])}import type { Cradle } from './cradle.ts';
${local}
const T: readonly (keyof Cradle)[] = [
${providers.map((p) => `  '${p.name}',\n`).join('')}];

export const scale = {
  count: ${providers.length},
  entries: [${graph.entries.join(', ')}],
  target: ${graph.target},
  packages: ['awilix'],
  built,
  create: (): AwilixContainer<Cradle> => {
    const container = createContainer<Cradle>({
      injectionMode: InjectionMode.PROXY,
      strict: true,
    });
${setup}    return container;
  },
  get: (handle: AwilixContainer<Cradle>, index: number): unknown =>
    handle.resolve(T[index]),
};
`;
}

export function renderAwilix(graph: ScaleGraph): Files {
  if (graph.providers.some(isAsync))
    throw new Error(
      'awilix resolves synchronously; an async graph is not-applicable',
    );
  if (perClass(graph) && graph.providers.some((p) => p.kind !== 'class'))
    throw new Error(`${graph.shape} renders classes only`);
  return {
    ...layout(graph, {
      app: appFile(graph),
      classFile: (p) => classFile(graph, p),
      moduleFile: (k) => moduleFile(graph, k),
    }),
    'cradle.ts': cradleFile(graph),
  };
}
