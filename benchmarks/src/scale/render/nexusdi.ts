/**
 * NexusDI `plain` (scale spec 4.2): an interface and a `Token<IFoo>` per
 * provider, classes that implement their interface, take their
 * dependencies' interfaces and list their tokens in `static deps`,
 * `provide(T, { useClass })`, `{ useFactory, deps }` and `{ useValue }`
 * bindings, and one `defineModule` per graph module. The form follows
 * fixtures/nexusdi/plain.ts and the README sections the header cites.
 */
import type { ScaleGraph, ScaleProvider } from '../graph.ts';
import {
  classBody,
  className,
  counterFile,
  iface,
  importList,
  moduleConst,
  perClass,
  token,
  type Files,
} from './shared.ts';

const DOCS = 'https://github.com/NexusDI/core#readme';

const header = (graph: ScaleGraph) =>
  `// Scale app: ${graph.shape} at ${graph.size} providers, NexusDI plain.
// Docs: ${DOCS}
// (Interfaces and tokens, Providers, Modules), read 2026-09-30. An async
// factory is \`useFactory: async\`, which Nexus.create awaits.
// Departures: none.
`;

/** tokens.ts: an interface and a token per provider. */
function tokensFile(graph: ScaleGraph): string {
  const lines = graph.providers.map(
    (p) =>
      `export interface ${iface(p)} {\n  readonly id: '${p.name}';\n}\nexport const ${token(p)} = new Token<${iface(p)}>('${p.name}');\n`,
  );
  return `import { Token } from '@nexusdi/core';\n\n${lines.join('')}`;
}

const builds = (p: ScaleProvider) => p.kind !== 'value';

/** The class of a class provider, or the product class of a factory. */
function classOf(graph: ScaleGraph, p: ScaleProvider): string {
  const deps = p.deps.map((d) => token(graph.providers[d]));
  const head =
    p.kind === 'class' && deps.length > 0
      ? `  static deps = [${deps.join(', ')}] as const;\n`
      : '';
  return `export class ${className(p)} implements ${iface(p)} {\n${classBody(
    graph,
    p,
    { param: iface, report: p.kind === 'class', head },
  )}}\n`;
}

/** The provide() entry of one provider, indented for a providers array. */
function binding(graph: ScaleGraph, p: ScaleProvider): string {
  if (p.kind === 'class')
    return `    provide(${token(p)}, { useClass: ${className(p)} }),\n`;
  if (p.kind === 'value')
    return `    provide(${token(p)}, { useValue: { id: '${p.name}' } }),\n`;
  const deps = p.deps.map((d) => graph.providers[d]);
  const params = deps.map((d, i) => `d${i}: ${iface(d)}`).join(', ');
  const args = deps.map((_, i) => `d${i}`).join(', ');
  const async = p.kind === 'async-factory';
  const returns = async ? `Promise<${iface(p)}>` : iface(p);
  return `    provide(${token(p)}, {
      useFactory: ${async ? 'async ' : ''}(${params}): ${returns} => {
${async ? '        await Promise.resolve();\n' : ''}        const made = new ${className(p)}(${args});
        __scaleBuilt(${p.index}, '${p.kind}');
        return made;
      },
${deps.length > 0 ? `      deps: [${deps.map(token).join(', ')}],\n` : ''}    }),\n`;
}

/**
 * The tokens.ts import for code that declares `own` (as classes, bindings
 * or both): each provider's token where `tokens` holds it and its
 * interface where `types` does, in index order.
 */
function tokensImport(
  graph: ScaleGraph,
  own: readonly ScaleProvider[],
  opts: { classes: boolean; bindings: boolean },
): string {
  const tokens = new Set<number>();
  const types = new Set<number>();
  for (const p of own) {
    if (opts.bindings) tokens.add(p.index);
    if (!builds(p)) continue;
    // A class implements its interface; a factory returns it.
    if (opts.classes || p.kind !== 'class') types.add(p.index);
    const typed = opts.classes || (opts.bindings && p.kind !== 'class');
    if (!typed) continue;
    for (const d of p.deps) {
      types.add(d);
      // Static deps name their tokens in the class; factory deps in the binding.
      if (p.kind === 'class' ? opts.classes : opts.bindings) tokens.add(d);
    }
  }
  const names = [...new Set([...tokens, ...types])]
    .sort((a, b) => a - b)
    .flatMap((i) => {
      const p = graph.providers[i];
      return [
        ...(tokens.has(i) ? [token(p)] : []),
        ...(types.has(i) ? [`type ${iface(p)}`] : []),
      ];
    });
  return importList(names, './tokens.ts');
}

const counterImport = (names: string[]) =>
  names.length === 0
    ? ''
    : `import { ${names.join(', ')} } from './counter.ts';\n`;

/** The providers array of a defineModule call. */
const providersOf = (graph: ScaleGraph, own: readonly ScaleProvider[]) =>
  `  providers: [\n${own.map((p) => binding(graph, p)).join('')}  ],\n`;

/** One file per module: its classes and its defineModule. */
function moduleFile(graph: ScaleGraph, k: number): string {
  const m = graph.modules[k];
  const own = graph.providers.filter((p) => p.module === k);
  const imports = m.imports
    .map((i) => {
      const name = graph.modules[i].name;
      return `import { ${moduleConst(name)} } from './${name}.ts';\n`;
    })
    .join('');
  const exports = m.exports.map((e) => token(graph.providers[e]));
  return `import { defineModule, provide } from '@nexusdi/core';

${counterImport(own.some(builds) ? ['__scaleBuilt'] : [])}${imports}${tokensImport(graph, own, { classes: true, bindings: true })}
${own
  .filter(builds)
  .map((p) => `${classOf(graph, p)}\n`)
  .join('')}export const ${moduleConst(m.name)} = defineModule({
  name: '${m.name}',
${m.imports.length > 0 ? `  imports: [${m.imports.map((i) => moduleConst(graph.modules[i].name)).join(', ')}],\n` : ''}${providersOf(graph, own)}${exports.length > 0 ? `  exports: [${exports.join(', ')}],\n` : ''}});
`;
}

/** One file per class, as scale-200: the class alone. */
function classFile(graph: ScaleGraph, p: ScaleProvider): string {
  return `${counterImport(p.kind === 'class' ? ['__scaleBuilt'] : [])}${tokensImport(graph, [p], { classes: true, bindings: false })}
${classOf(graph, p)}`;
}

/** The token table, the root module, the lookup options and the adapter. */
function appFile(graph: ScaleGraph): string {
  const { providers, modules } = graph;
  const split = perClass(graph);
  const entries = new Set(graph.entries);
  const allEntries = providers.every((p) => entries.has(p.index));
  const factories = providers.some(
    (p) => p.kind === 'factory' || p.kind === 'async-factory',
  );
  const core = [
    'Nexus',
    'Token',
    'defineModule',
    ...(split ? ['provide'] : []),
    ...(allEntries ? [] : ['type LookupOptions']),
  ];
  const T = providers.map((p) => `  ${token(p)},\n`).join('');
  // With one class per file, the module's definition sits here, as
  // scale-200's main.ts holds it.
  const sources = split
    ? `${providers
        .filter(builds)
        .map((p) => `import { ${className(p)} } from './${p.name}.ts';\n`)
        .join(
          '',
        )}${tokensImport(graph, providers, { classes: false, bindings: true })}`
    : `${modules
        .map(
          (m) => `import { ${moduleConst(m.name)} } from './${m.name}.ts';\n`,
        )
        .join('')}${importList(providers.map(token), './tokens.ts')}`;
  const definitions = split
    ? modules
        .map(
          (m, k) =>
            `const ${moduleConst(m.name)} = defineModule({
  name: '${m.name}',
${providersOf(
  graph,
  providers.filter((p) => p.module === k),
)}  exports: [${m.exports.map((e) => token(providers[e])).join(', ')}],
});\n\n`,
        )
        .join('')
    : '';
  const lookups = allEntries
    ? ''
    : `
// The root sees the exports of the modules it imports. Every other
// provider is looked up inside its own module (LookupOptions.module).
const L: readonly (LookupOptions | undefined)[] = [
${providers
  .map((p) =>
    entries.has(p.index)
      ? '  undefined,\n'
      : `  { module: ${moduleConst(modules[p.module].name)} },\n`,
  )
  .join('')}];
`;
  return `${header(graph)}import { ${core.join(', ')} } from '@nexusdi/core';

${counterImport(split && factories ? ['__scaleBuilt', 'built'] : ['built'])}${sources}
${definitions}const App = defineModule({
  name: 'App',
  imports: [${graph.rootImports.map((i) => moduleConst(modules[i].name)).join(', ')}],
});

const T: readonly Token<unknown>[] = [
${T}];
${lookups}
export const scale = {
  count: ${providers.length},
  entries: [${graph.entries.join(', ')}],
  target: ${graph.target},
  packages: ['@nexusdi/core'],
  built,
  create: (): Promise<Nexus> => Nexus.create(App),
  get: (handle: Nexus, index: number): unknown =>
    handle.get(T[index]${allEntries ? '' : ', L[index]'}),
};
`;
}

export function renderNexusdi(graph: ScaleGraph): Files {
  const files: Files = {
    'counter.ts': counterFile(graph.providers.length),
    'tokens.ts': tokensFile(graph),
    'app.ts': appFile(graph),
  };
  if (perClass(graph))
    for (const p of graph.providers.filter(builds))
      files[`${p.name}.ts`] = classFile(graph, p);
  else
    graph.modules.forEach((m, k) => {
      files[`${m.name}.ts`] = moduleFile(graph, k);
    });
  return files;
}
