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

const top = (nodes: Node[]) => nodes.slice(-WIDTH);
const iface = (name: string) => `I${name}`;
const token = (name: string) => `T${name}`;

/** The fields and constructor every class shares; `param` types a dependency. */
function body(n: Node, param: (dep: string) => string): string {
  const fields = n.deps
    .map((d, i) => `  readonly d${i}: ${param(d)};\n`)
    .join('');
  const params = n.deps.map((d, i) => `d${i}: ${param(d)}`).join(', ');
  const sets = n.deps.map((_, i) => `    this.d${i} = d${i};\n`).join('');
  return `  readonly id = '${n.name}';\n${fields}  constructor(${params}) {\n${sets}  }\n`;
}

/** tokens.ts for the interface-first variants: an interface and a token per class. */
function tokens(
  nodes: Node[],
  importLine: string,
  make: (n: string) => string,
) {
  const lines = nodes.flatMap((n) => [
    `export interface ${iface(n.name)} {\n  readonly id: '${n.name}';\n}`,
    `export const ${token(n.name)} = ${make(n.name)};`,
  ]);
  return `${importLine}\n\n${lines.join('\n')}\n`;
}

const tokenImport = (n: Node) =>
  `import {\n${[n.name, ...n.deps]
    .flatMap((d) =>
      d === n.name
        ? [`  type ${iface(d)},`]
        : [`  ${token(d)},`, `  type ${iface(d)},`],
    )
    .join('\n')}\n} from './tokens.ts';\n`;
const classImports = (n: Node) =>
  n.deps.map((d) => `import { ${d} } from './${d}.ts';\n`).join('');
const allClasses = (nodes: Node[]) =>
  nodes.map((n) => `import { ${n.name} } from './${n.name}.ts';\n`).join('');
const allTokens = (nodes: Node[]) =>
  `import {\n${nodes.map((n) => `  ${token(n.name)},`).join('\n')}\n} from './tokens.ts';\n`;

type Template = (nodes: Node[]) => Record<string, string>;

function perClass(
  nodes: Node[],
  file: (n: Node) => string,
  extra: Record<string, string>,
): Record<string, string> {
  return {
    ...Object.fromEntries(nodes.map((n) => [n.name, file(n)])),
    ...extra,
  };
}

const nexusdi =
  (decorated: boolean): Template =>
  (nodes) =>
    perClass(
      nodes,
      (n) =>
        `${decorated ? "import { Injectable } from '@nexusdi/decorators';\n" : ''}${tokenImport(n)}\n` +
        `${decorated ? `@Injectable({ deps: [${n.deps.map(token).join(', ')}] })\n` : ''}` +
        `export class ${n.name} implements ${iface(n.name)} {\n` +
        `${decorated ? '' : `  static deps = [${n.deps.map(token).join(', ')}] as const;\n`}` +
        body(n, iface) +
        '}\n',
      {
        tokens: tokens(
          nodes,
          "import { Token } from '@nexusdi/core';",
          (x) => `new Token<${iface(x)}>('${x}')`,
        ),
        main:
          `import { Nexus, defineModule, provide } from '@nexusdi/core';\n\n${allClasses(nodes)}${allTokens(nodes)}\n` +
          `const Scale = defineModule({\n  name: 'Scale',\n  providers: [\n${nodes
            .map(
              (n) => `    provide(${token(n.name)}, { useClass: ${n.name} }),`,
            )
            .join(
              '\n',
            )}\n  ],\n});\n\nconst ship = await Nexus.create(Scale);\n` +
          top(nodes)
            .map((n) => `ship.get(${token(n.name)});\n`)
            .join(''),
      },
    );

const inversifyDecorated: Template = (nodes) =>
  perClass(
    nodes,
    (n) =>
      `import { inject, injectable } from 'inversify';\n${classImports(n)}\n@injectable()\nexport class ${n.name} {\n` +
      body(n, (d) => d).replace(
        /constructor\((.*)\)/,
        (_, ps: string) =>
          `constructor(${ps
            .split(', ')
            .filter((p) => p !== '')
            .map((p) => `@inject(${p.split(': ')[1]}) ${p}`)
            .join(', ')})`,
      ) +
      '}\n',
    {
      main:
        `import { Container } from 'inversify';\n\n${allClasses(nodes)}\nconst container = new Container();\n` +
        nodes
          .map(
            (n) => `container.bind(${n.name}).toSelf().inSingletonScope();\n`,
          )
          .join('') +
        top(nodes)
          .map((n) => `container.get(${n.name});\n`)
          .join(''),
    },
  );

const inversifyPlain: Template = (nodes) =>
  perClass(
    nodes,
    (n) =>
      `import type { ${[n.name, ...n.deps].map(iface).join(', ')} } from './tokens.ts';\n\nexport class ${n.name} implements ${iface(n.name)} {\n${body(n, iface)}}\n`,
    {
      tokens: tokens(
        nodes,
        "import type { ServiceIdentifier } from 'inversify';",
        (x) => `Symbol.for('${x}') as ServiceIdentifier<${iface(x)}>`,
      ),
      main:
        `import { Container } from 'inversify';\n\n${allClasses(nodes)}${tokenImportAll(nodes)}\nconst container = new Container();\n` +
        nodes
          .map(
            (n) =>
              `container\n  .bind(${token(n.name)})\n  .toResolvedValue(\n    (${n.deps.map((d, i) => `d${i}: ${iface(d)}`).join(', ')}) => new ${n.name}(${n.deps.map((_, i) => `d${i}`).join(', ')}),\n    [${n.deps.map(token).join(', ')}],\n  )\n  .inSingletonScope();\n`,
          )
          .join('') +
        top(nodes)
          .map((n) => `container.get(${token(n.name)});\n`)
          .join(''),
    },
  );

/** Every token and interface, for main.ts files that name dependency types. */
function tokenImportAll(nodes: Node[]): string {
  return `import {\n${nodes.map((n) => `  ${token(n.name)},\n  type ${iface(n.name)},`).join('\n')}\n} from './tokens.ts';\n`;
}

const tsyringeDecorated =
  (explicit: boolean): Template =>
  (nodes) =>
    perClass(
      nodes,
      (n) =>
        `import { ${explicit ? 'inject, ' : ''}singleton } from 'tsyringe';\n${classImports(n)}\n@singleton()\nexport class ${n.name} {\n` +
        (explicit
          ? body(n, (d) => d).replace(
              /constructor\((.*)\)/,
              (_, ps: string) =>
                `constructor(${ps
                  .split(', ')
                  .filter((p) => p !== '')
                  .map((p) => `@inject(${p.split(': ')[1]}) ${p}`)
                  .join(', ')})`,
            )
          : body(n, (d) => d)) +
        '}\n',
      {
        main:
          `import 'reflect-metadata';\nimport { container } from 'tsyringe';\n\n${allClasses(nodes)}\n` +
          top(nodes)
            .map((n) => `container.resolve(${n.name});\n`)
            .join(''),
      },
    );

const tsyringePlain: Template = (nodes) =>
  perClass(
    nodes,
    (n) =>
      `import type { ${[n.name, ...n.deps].map(iface).join(', ')} } from './tokens.ts';\n\nexport class ${n.name} implements ${iface(n.name)} {\n${body(n, iface)}}\n`,
    {
      tokens: tokens(nodes, '', (x) => `'${x}'`).trimStart(),
      main:
        `import 'reflect-metadata';\nimport { container, instanceCachingFactory } from 'tsyringe';\n\n${allClasses(nodes)}${tokenImportAll(nodes)}\n` +
        nodes
          .map(
            (n) =>
              `container.register<${iface(n.name)}>(${token(n.name)}, {\n  useFactory: instanceCachingFactory(\n    (c) => new ${n.name}(${n.deps.map((d) => `c.resolve<${iface(d)}>(${token(d)})`).join(', ')}),\n  ),\n});\n`,
          )
          .join('') +
        top(nodes)
          .map((n) => `container.resolve(${token(n.name)});\n`)
          .join(''),
    },
  );

const awilixPlain: Template = (nodes) =>
  perClass(
    nodes,
    (n) =>
      `${classImports(n).replace(/import \{/g, 'import type {')}\nexport class ${n.name} {\n${body(
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
      main:
        `import { InjectionMode, asClass, createContainer } from 'awilix';\n\n${allClasses(nodes)}\n` +
        `const container = createContainer({\n  injectionMode: InjectionMode.PROXY,\n  strict: true,\n});\ncontainer.register({\n` +
        nodes
          .map((n) => `  ${n.name}: asClass(${n.name}).singleton(),\n`)
          .join('') +
        '});\n' +
        top(nodes)
          .map((n) => `container.resolve('${n.name}');\n`)
          .join(''),
    },
  );

const needleDecorated: Template = (nodes) =>
  perClass(
    nodes,
    (n) =>
      `import { inject, injectable } from '@needle-di/core';\n${classImports(n)}\n@injectable()\nexport class ${n.name} {\n  readonly id = '${n.name}';\n` +
      n.deps.map((d, i) => `  readonly d${i} = inject(${d});\n`).join('') +
      '}\n',
    {
      main:
        `import { Container } from '@needle-di/core';\n\n${allClasses(nodes)}\nconst container = new Container();\n` +
        top(nodes)
          .map((n) => `container.get(${n.name});\n`)
          .join(''),
    },
  );

const needlePlain: Template = (nodes) =>
  perClass(
    nodes,
    (n) =>
      `import type { ${[n.name, ...n.deps].map(iface).join(', ')} } from './tokens.ts';\n\nexport class ${n.name} implements ${iface(n.name)} {\n${body(n, iface)}}\n`,
    {
      tokens: tokens(
        nodes,
        "import { InjectionToken } from '@needle-di/core';",
        (x) => `new InjectionToken<${iface(x)}>('${x}')`,
      ),
      main:
        `import { Container, inject } from '@needle-di/core';\n\n${allClasses(nodes)}${allTokens(nodes)}\nconst container = new Container();\n` +
        nodes
          .map(
            (n) =>
              `container.bind({\n  provide: ${token(n.name)},\n  useFactory: () => new ${n.name}(${n.deps.map((d) => `inject(${token(d)})`).join(', ')}),\n});\n`,
          )
          .join('') +
        top(nodes)
          .map((n) => `container.get(${token(n.name)});\n`)
          .join(''),
    },
  );

const TEMPLATES: Record<string, Template> = {
  'nexusdi/plain': nexusdi(false),
  'nexusdi/decorated': nexusdi(true),
  'inversify/plain': inversifyPlain,
  'inversify/decorated': inversifyDecorated,
  'inversify/decorated-explicit': inversifyDecorated,
  'tsyringe/plain': tsyringePlain,
  'tsyringe/decorated': tsyringeDecorated(false),
  'tsyringe/decorated-explicit': tsyringeDecorated(true),
  'awilix/plain': awilixPlain,
  'needle-di/plain': needlePlain,
  'needle-di/decorated': needleDecorated,
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
