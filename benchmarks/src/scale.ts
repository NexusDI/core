/**
 * scale-200: the build-only fixture of spec 4.7. 20 layers of 10 classes,
 * one class per file. Class c_L_P takes c_(L-1)_P and c_(L-1)_((P+1)%10),
 * wired the way the library-variant's Meridian-8 fixture wires providers.
 * main.ts registers all 200 and resolves the top layer. Every file uses
 * erasable syntax, so node-strip-types can load the plain variants.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LibraryId, Variant } from './schema.ts';

const LAYERS = 20;
const WIDTH = 10;

interface Node {
  name: string;
  deps: string[];
}

function graph(): Node[] {
  const nodes: Node[] = [];
  for (let l = 0; l < LAYERS; l++)
    for (let p = 0; p < WIDTH; p++)
      nodes.push({
        name: `c_${l}_${p}`,
        deps:
          l === 0 ? [] : [`c_${l - 1}_${p}`, `c_${l - 1}_${(p + 1) % WIDTH}`],
      });
  return nodes;
}

const iface = (name: string) => `I${name}`;
const token = (name: string) => `T${name}`;
const each = (nodes: readonly Node[], line: (n: Node) => string) =>
  nodes.map(line).join('');
const top = (nodes: readonly Node[]) => nodes.slice(-WIDTH);

/**
 * The fields and constructor every class shares. `param` types a
 * dependency, and `decorate` prefixes its parameter.
 */
function body(
  n: Node,
  param: (dep: string) => string,
  decorate: (dep: string) => string = () => '',
): string {
  const fields = n.deps
    .map((d, i) => `  readonly d${i}: ${param(d)};\n`)
    .join('');
  const params = n.deps
    .map((d, i) => `${decorate(d)}d${i}: ${param(d)}`)
    .join(', ');
  const sets = n.deps.map((_, i) => `    this.d${i} = d${i};\n`).join('');
  return `  readonly id = '${n.name}';\n${fields}  constructor(${params}) {\n${sets}  }\n`;
}

const classImports = (n: Node, keyword = 'import') =>
  n.deps.map((d) => `${keyword} { ${d} } from './${d}.ts';\n`).join('');
const allClasses = (nodes: readonly Node[]) =>
  each(nodes, (n) => `import { ${n.name} } from './${n.name}.ts';\n`);

/** Imports every token, and with `types` every interface, from tokens.ts. */
const allTokens = (nodes: readonly Node[], types: boolean) =>
  `import {\n${nodes
    .map(
      (n) => `  ${token(n.name)},${types ? `\n  type ${iface(n.name)},` : ''}`,
    )
    .join('\n')}\n} from './tokens.ts';\n`;

/** tokens.ts for the interface-first variants: an interface and a token per class. */
function tokens(
  nodes: readonly Node[],
  importLine: string,
  make: (n: string) => string,
): string {
  const lines = nodes.flatMap((n) => [
    `export interface ${iface(n.name)} {\n  readonly id: '${n.name}';\n}`,
    `export const ${token(n.name)} = ${make(n.name)};`,
  ]);
  return `${importLine}${importLine === '' ? '' : '\n\n'}${lines.join('\n')}\n`;
}

type Files = Record<string, string>;
type Template = (nodes: readonly Node[]) => Files;

function files(
  nodes: readonly Node[],
  file: (n: Node) => string,
  extra: Files,
): Files {
  return {
    ...Object.fromEntries(nodes.map((n) => [n.name, file(n)])),
    ...extra,
  };
}

/** A class that implements its interface and takes its dependencies' interfaces. */
const interfaceClass = (n: Node, head = '') =>
  `${head}export class ${n.name} implements ${iface(n.name)} {\n${body(n, iface)}}\n`;

/**
 * The factory form of a plain variant: undecorated classes, a token per
 * class, and main.ts registering a factory per token.
 */
function factoryVariant(v: {
  tokenImport: string;
  tokenOf: (name: string) => string;
  mainImport: string;
  withTypes: boolean;
  setup: string;
  register: (n: Node) => string;
  resolve: (n: Node) => string;
}): Template {
  return (nodes) =>
    files(
      nodes,
      (n) =>
        interfaceClass(
          n,
          `import type { ${[n.name, ...n.deps].map(iface).join(', ')} } from './tokens.ts';\n\n`,
        ),
      {
        tokens: tokens(nodes, v.tokenImport, v.tokenOf),
        main: `${v.mainImport}\n\n${allClasses(nodes)}${allTokens(nodes, v.withTypes)}\n${v.setup}${each(nodes, v.register)}${each(top(nodes), v.resolve)}`,
      },
    );
}

/** A decorated variant whose classes take their dependencies' classes. */
function classVariant(v: {
  head: string;
  decorator: string;
  inject: boolean;
  mainImport: string;
  setup: string;
  register?: (n: Node) => string;
  resolve: (n: Node) => string;
}): Template {
  return (nodes) =>
    files(
      nodes,
      (n) =>
        `${v.head}\n${classImports(n)}\n${v.decorator}\nexport class ${n.name} {\n${body(
          n,
          (d) => d,
          v.inject ? (d) => `@inject(${d}) ` : undefined,
        )}}\n`,
      {
        main: `${v.mainImport}\n\n${allClasses(nodes)}\n${v.setup}${v.register === undefined ? '' : each(nodes, v.register)}${each(top(nodes), v.resolve)}`,
      },
    );
}

const nexusdi =
  (decorated: boolean): Template =>
  (nodes) =>
    files(
      nodes,
      (n) =>
        interfaceClass(
          n,
          `${decorated ? "import { Injectable } from '@nexusdi/decorators';\n" : ''}import {\n${[
            n.name,
            ...n.deps,
          ]
            .map((d) =>
              d === n.name
                ? `  type ${iface(d)},`
                : `  ${token(d)},\n  type ${iface(d)},`,
            )
            .join('\n')}\n} from './tokens.ts';\n\n${
            decorated
              ? `@Injectable({ deps: [${n.deps.map(token).join(', ')}] })\n`
              : ''
          }`,
        ).replace(
          '{\n  readonly id',
          decorated
            ? '{\n  readonly id'
            : `{\n  static deps = [${n.deps.map(token).join(', ')}] as const;\n  readonly id`,
        ),
      {
        tokens: tokens(
          nodes,
          "import { Token } from '@nexusdi/core';",
          (x) => `new Token<${iface(x)}>('${x}')`,
        ),
        main: `import { Nexus, defineModule, provide } from '@nexusdi/core';\n\n${allClasses(nodes)}${allTokens(nodes, false)}\nconst Scale = defineModule({\n  name: 'Scale',\n  providers: [\n${each(
          nodes,
          (n) => `    provide(${token(n.name)}, { useClass: ${n.name} }),\n`,
        )}  ],\n});\n\nconst ship = await Nexus.create(Scale);\n${each(
          top(nodes),
          (n) => `ship.get(${token(n.name)});\n`,
        )}`,
      },
    );

const inversifyDecorated = classVariant({
  head: "import { inject, injectable } from 'inversify';",
  decorator: '@injectable()',
  inject: true,
  mainImport: "import { Container } from 'inversify';",
  setup: 'const container = new Container();\n',
  register: (n) => `container.bind(${n.name}).toSelf().inSingletonScope();\n`,
  resolve: (n) => `container.get(${n.name});\n`,
});

const tsyringeDecorated = (explicit: boolean) =>
  classVariant({
    head: `import { ${explicit ? 'inject, ' : ''}singleton } from 'tsyringe';`,
    decorator: '@singleton()',
    inject: explicit,
    mainImport:
      "import 'reflect-metadata';\nimport { container } from 'tsyringe';",
    setup: '',
    resolve: (n) => `container.resolve(${n.name});\n`,
  });

const TEMPLATES: Record<string, Template> = {
  'nexusdi/plain': nexusdi(false),
  'nexusdi/decorated': nexusdi(true),
  'inversify/plain': factoryVariant({
    tokenImport: "import type { ServiceIdentifier } from 'inversify';",
    tokenOf: (x) => `Symbol.for('${x}') as ServiceIdentifier<${iface(x)}>`,
    mainImport: "import { Container } from 'inversify';",
    withTypes: true,
    setup: 'const container = new Container();\n',
    register: (n) =>
      `container\n  .bind(${token(n.name)})\n  .toResolvedValue(\n    (${n.deps.map((d, i) => `d${i}: ${iface(d)}`).join(', ')}) => new ${n.name}(${n.deps.map((_, i) => `d${i}`).join(', ')}),\n    [${n.deps.map(token).join(', ')}],\n  )\n  .inSingletonScope();\n`,
    resolve: (n) => `container.get(${token(n.name)});\n`,
  }),
  // inversify's documented form names every dependency with @inject, so
  // its two decorated variants share one template; the profile differs.
  'inversify/decorated': inversifyDecorated,
  'inversify/decorated-explicit': inversifyDecorated,
  'tsyringe/plain': factoryVariant({
    tokenImport: '',
    tokenOf: (x) => `'${x}'`,
    mainImport:
      "import 'reflect-metadata';\nimport { container, instanceCachingFactory } from 'tsyringe';",
    withTypes: true,
    setup: '',
    register: (n) =>
      `container.register<${iface(n.name)}>(${token(n.name)}, {\n  useFactory: instanceCachingFactory(\n    (c) => new ${n.name}(${n.deps.map((d) => `c.resolve<${iface(d)}>(${token(d)})`).join(', ')}),\n  ),\n});\n`,
    resolve: (n) => `container.resolve(${token(n.name)});\n`,
  }),
  'tsyringe/decorated': tsyringeDecorated(false),
  'tsyringe/decorated-explicit': tsyringeDecorated(true),
  'awilix/plain': (nodes) =>
    files(
      nodes,
      (n) =>
        `${classImports(n, 'import type')}\nexport class ${n.name} {\n${body(
          n,
          (d) => d,
        )
          .replace(/constructor\((.*)\)/, () =>
            n.deps.length === 0
              ? 'constructor()'
              : `constructor({ ${n.deps.join(', ')} }: { ${n.deps.map((d) => `${d}: ${d}`).join('; ')} })`,
          )
          .replace(
            /this\.d(\d) = d\d;/g,
            (_, i: string) => `this.d${i} = ${n.deps[Number(i)]};`,
          )}}\n`,
      {
        main: `import { InjectionMode, asClass, createContainer } from 'awilix';\n\n${allClasses(nodes)}\nconst container = createContainer({\n  injectionMode: InjectionMode.PROXY,\n  strict: true,\n});\ncontainer.register({\n${each(
          nodes,
          (n) => `  ${n.name}: asClass(${n.name}).singleton(),\n`,
        )}});\n${each(top(nodes), (n) => `container.resolve('${n.name}');\n`)}`,
      },
    ),
  'needle-di/plain': factoryVariant({
    tokenImport: "import { InjectionToken } from '@needle-di/core';",
    tokenOf: (x) => `new InjectionToken<${iface(x)}>('${x}')`,
    mainImport: "import { Container, inject } from '@needle-di/core';",
    withTypes: false,
    setup: 'const container = new Container();\n',
    register: (n) =>
      `container.bind({\n  provide: ${token(n.name)},\n  useFactory: () => new ${n.name}(${n.deps.map((d) => `inject(${token(d)})`).join(', ')}),\n});\n`,
    resolve: (n) => `container.get(${token(n.name)});\n`,
  }),
  'needle-di/decorated': (nodes) =>
    files(
      nodes,
      (n) =>
        `import { inject, injectable } from '@needle-di/core';\n${classImports(n)}\n@injectable()\nexport class ${n.name} {\n  readonly id = '${n.name}';\n${n.deps
          .map((d, i) => `  readonly d${i} = inject(${d});\n`)
          .join('')}}\n`,
      {
        main: `import { Container } from '@needle-di/core';\n\n${allClasses(nodes)}\nconst container = new Container();\n${each(
          top(nodes),
          (n) => `container.get(${n.name});\n`,
        )}`,
      },
    ),
};

/** Writes scale-200 for a library-variant into `outDir` and returns the file paths. */
export function generateScale(
  library: LibraryId,
  variant: Variant,
  outDir: string,
): string[] {
  const template = TEMPLATES[`${library}/${variant}`];
  if (template === undefined)
    throw new Error(`no scale-200 template for ${library} ${variant}`);
  mkdirSync(outDir, { recursive: true });
  return Object.entries(template(graph())).map(([name, text]) => {
    const path = join(outDir, `${name}.ts`);
    writeFileSync(path, text);
    return path;
  });
}

/** Import declarations across the generated sources. */
export function countImports(texts: readonly string[]): number {
  return texts.reduce(
    (sum, text) => sum + (text.match(/^import\s/gm) ?? []).length,
    0,
  );
}
