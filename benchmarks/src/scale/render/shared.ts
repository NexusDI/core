/**
 * What every scale renderer shares (scale spec section 4.1): identifier
 * names, the construction counter, the class body, the factory body, the
 * value literal and the file layout. Every library's renderer builds its
 * classes, factories and values from these, so each provider does the same
 * work in every library.
 */
import type { Shape } from '../config.ts';
import type { ScaleGraph, ScaleProvider } from '../graph.ts';

/** File name, relative to the cell's src/, to its text. */
export type Files = Record<string, string>;

/** Turns a graph into a library-variant's source files, app.ts among them. */
export type Renderer = (graph: ScaleGraph) => Files;

/** p0042 becomes P0042: the class of a class provider or a factory's product. */
export const className = (p: ScaleProvider) => p.name.toUpperCase();
/** The interface a class implements and its dependants take. */
export const iface = (p: ScaleProvider) => `I${className(p)}`;
/** The token that names the provider. */
export const token = (p: ScaleProvider) => `T${className(p)}`;
/** m03 becomes M03: the constant that holds a module's definition. */
export const moduleConst = (name: string) => name.toUpperCase();

/**
 * Shapes rendered one class per file, as scale-200 is; the others render
 * one file per module.
 */
const PER_CLASS: readonly Shape[] = ['wide', 'deep'];
export const perClass = (graph: ScaleGraph) => PER_CLASS.includes(graph.shape);

/**
 * counter.ts: the counter every class constructor and factory body calls
 * last. One array increment per construction, identical in every library.
 */
function counterFile(count: number): string {
  return `const counts = new Uint32Array(${count});
const kinds: (string | undefined)[] = new Array<string | undefined>(${count});

/** Constructions per provider index, and the kind each one reported. */
export const built = { counts, kinds };

export function __scaleBuilt(index: number, kind: string): void {
  counts[index]++;
  kinds[index] = kind;
}
`;
}

/**
 * A class's members: `readonly id`, one field per dependency in
 * constructor order, and a constructor that assigns them. With `report`,
 * the constructor ends with the counter call; a factory's product class
 * leaves it to the factory body. `head` goes before the id, for static
 * members. `decorate` prefixes each constructor parameter, for parameter
 * decorators.
 */
export function classBody(
  graph: ScaleGraph,
  p: ScaleProvider,
  opts: {
    param: (dep: ScaleProvider) => string;
    report: boolean;
    head?: string;
    decorate?: (dep: ScaleProvider) => string;
  },
): string {
  const deps = p.deps.map((d) => graph.providers[d]);
  const fields = deps
    .map((d, i) => `  readonly d${i}: ${opts.param(d)};\n`)
    .join('');
  const params = deps
    .map((d, i) => `${opts.decorate?.(d) ?? ''}d${i}: ${opts.param(d)}`)
    .join(', ');
  const sets = deps.map((_, i) => `    this.d${i} = d${i};\n`).join('');
  const report = opts.report
    ? `    __scaleBuilt(${p.index}, '${p.kind}');\n`
    : '';
  const ctor =
    sets === '' && report === ''
      ? ''
      : `  constructor(${params}) {\n${sets}${report}  }\n`;
  return `${opts.head ?? ''}  readonly id = '${p.name}';\n${fields}${ctor}`;
}

export const isAsync = (p: ScaleProvider) => p.kind === 'async-factory';

/** Every provider but a value constructs something. */
export const builds = (p: ScaleProvider) => p.kind !== 'value';

/** The graph has a sync or async factory provider. */
export const hasFactories = (graph: ScaleGraph) =>
  graph.providers.some(
    (p) => p.kind === 'factory' || p.kind === 'async-factory',
  );

/** The providers module `k` declares, in index order. */
export const ownOf = (graph: ScaleGraph, k: number) =>
  graph.providers.filter((p) => p.module === k);

/**
 * The statements of a factory provider's body, one per line, each
 * prefixed with `indent`: an async factory awaits once before it
 * constructs, then the body builds the product class from its parameters
 * `d0`, `d1`, ..., reports the construction and returns the product. The
 * caller binds `d0`, `d1`, ... in its library's factory form and supplies
 * the braces.
 */
function factoryBody(p: ScaleProvider, indent: string): string {
  const args = p.deps.map((_, i) => `d${i}`).join(', ');
  return [
    ...(isAsync(p) ? ['await Promise.resolve();'] : []),
    `const made = new ${className(p)}(${args});`,
    `__scaleBuilt(${p.index}, '${p.kind}');`,
    'return made;',
  ]
    .map((line) => `${indent}${line}\n`)
    .join('');
}

/**
 * A factory provider's arrow function, for libraries whose factory takes
 * its resolved dependencies as parameters: `d0`, `d1`, ... typed by
 * `param`, returning `product` (a Promise of it when async), with the
 * body of factoryBody. `indent` is the indent of the closing brace.
 */
export function factoryFunction(
  graph: ScaleGraph,
  p: ScaleProvider,
  opts: {
    param: (dep: ScaleProvider) => string;
    product: string;
    indent: string;
  },
): string {
  const params = p.deps
    .map((d, i) => `d${i}: ${opts.param(graph.providers[d])}`)
    .join(', ');
  const returns = isAsync(p) ? `Promise<${opts.product}>` : opts.product;
  return `${isAsync(p) ? 'async ' : ''}(${params}): ${returns} => {
${factoryBody(p, `${opts.indent}  `)}${opts.indent}}`;
}

/** A value provider's object, built at load in every library. */
export const valueLiteral = (p: ScaleProvider) => `{ id: '${p.name}' }`;

/** An import of `names` from the construction counter, if any. */
export const counterImport = (names: readonly string[]) =>
  names.length === 0
    ? ''
    : `import { ${names.join(', ')} } from './counter.ts';\n`;

/**
 * The head of a module file after its library import: the counter import
 * when the module constructs anything, then `imports`, then a blank line
 * and the module's classes, one per paragraph.
 */
export function moduleBody(
  own: readonly ScaleProvider[],
  imports: string,
  classOf: (p: ScaleProvider) => string,
): string {
  return `${counterImport(own.some(builds) ? ['__scaleBuilt'] : [])}${imports}
${own
  .filter(builds)
  .map((p) => `${classOf(p)}\n`)
  .join('')}`;
}

/**
 * A renderer's files: counter.ts, app.ts, tokens.ts when the library has
 * one, and one file per class (wide, deep) or per module (the others).
 */
export function layout(
  graph: ScaleGraph,
  parts: {
    app: string;
    tokens?: string;
    classFile: (p: ScaleProvider) => string;
    moduleFile: (k: number) => string;
  },
): Files {
  const files: Files = {
    'counter.ts': counterFile(graph.providers.length),
    ...(parts.tokens === undefined ? {} : { 'tokens.ts': parts.tokens }),
    'app.ts': parts.app,
  };
  if (perClass(graph))
    for (const p of graph.providers.filter(builds))
      files[`${p.name}.ts`] = parts.classFile(p);
  else
    graph.modules.forEach((m, k) => {
      files[`${m.name}.ts`] = parts.moduleFile(k);
    });
  return files;
}

/** `{ a, b, type C }` style import lists, one name per line. */
export function importList(names: readonly string[], from: string): string {
  if (names.length === 0) return '';
  return `import {\n${names.map((n) => `  ${n},\n`).join('')}} from '${from}';\n`;
}
