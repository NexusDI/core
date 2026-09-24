#!/usr/bin/env node
/**
 * Packs @nexusdi/core, installs the tarball into a throwaway project outside
 * the workspace, and checks that a consumer can import it and see its types.
 *
 * Nothing inside the repo can tell whether the package resolves as published.
 * tsconfig.base.json sets `customConditions: ["@nexusdi/source"]`, so every
 * in-workspace import reaches the package's TypeScript source, and the exports
 * map, the emitted declarations and the build output are all bypassed.
 *
 * The consumer here is the strictest one spec section 17 names: `lib:
 * ["es2022"]`, no @types/node, `skipLibCheck: false`, standard decorators and
 * `await using`. The declarations carry `/// <reference lib="esnext.disposable"
 * />`, which is what lets that consumer compile without a `lib` change.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import * as esbuild from 'esbuild';
import { rollup } from 'rollup';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Every published package, as `[directory, package name]`. The package name
 * is also the Nx project name the build step selects.
 */
const LIBS = [['libs/core', '@nexusdi/core']];

/** The entry points of @nexusdi/core, as its exports map names them. */
const CORE_ENTRIES = ['.', './node', './testing'];

/** Every JavaScript module under `root`, at any depth. */
const modulesUnder = (root) =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|cjs|mjs)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

const dir = mkdtempSync(join(tmpdir(), 'nexusdi-packaging-'));
let failed = false;

/**
 * A CommonJS consumer. The package is ESM only (spec section 12), and Node
 * 22.12.0, the engines floor, is the first 22.x release whose require() loads
 * an ES module without a flag. It requires all three entries and uses each.
 */
const CJS_CONSUMER = `'use strict';
const { Nexus, Token, defineModule, provide } = require('@nexusdi/core');
const { createTestingContainer } = require('@nexusdi/core/testing');
const { nodeScopeContext } = require('@nexusdi/core/node');

const REACTOR = new Token('ReactorCore');
class FusionReactor {
  constructor() {
    this.output = 1.21;
  }
}
class FakeReactor {
  constructor() {
    this.output = 0;
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

(async () => {
  const ship = await Nexus.create(Engineering, {
    scopeContext: nodeScopeContext(),
  });
  if (ship.get(REACTOR).output !== 1.21)
    throw new Error('require(esm): the provider did not resolve');
  const shuttle = await ship.createScope();
  const bound = await ship.runInScope(
    shuttle,
    async () => ship.currentScope() === shuttle,
  );
  if (!bound) throw new Error('require(esm): the node entry did not bind the scope');
  await shuttle[Symbol.asyncDispose]();
  await ship[Symbol.asyncDispose]();

  const fake = await createTestingContainer(Engineering)
    .override(REACTOR, { useClass: FakeReactor })
    .create();
  if (fake.get(REACTOR).output !== 0)
    throw new Error('require(esm): the testing entry did not override');
  await fake[Symbol.asyncDispose]();
  console.log(process.versions.node);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

/** The engines floor, and the current LTS line. npx fetches each binary from the `node` package. */
const CJS_NODE_VERSIONS = ['22.12.0', '24'];

/**
 * True when a module's top level awaits: an `await`, a `for await` or an
 * `await using` outside every function. require() throws
 * ERR_REQUIRE_ASYNC_MODULE for any ES module graph that contains one.
 */
function hasTopLevelAwait(ts, fileName, text) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  let found = false;
  const visit = (node) => {
    if (found || ts.isFunctionLike(node)) return;
    if (
      ts.isAwaitExpression(node) ||
      (ts.isForOfStatement(node) && node.awaitModifier !== undefined) ||
      (ts.isVariableDeclarationList(node) &&
        (node.flags & ts.NodeFlags.AwaitUsing) === ts.NodeFlags.AwaitUsing)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Names every public export, so tsc fails on one that stopped being exported. */
const CONSUMER = `
import {
  AmbiguousProviderError, AsyncTransientError, BlueprintError, CircularDependencyError,
  DisposedError, DuplicateProviderError, InvalidExportError, InvalidModuleError,
  InvalidProviderError, InvalidTokenError, LegacyDecoratorsError, LifetimeError,
  LoadedAfterScopeError, LoadError, MissingDepsError, MissingProviderError,
  ModuleImportCycleError, ModuleOptionsError, NexusError, NoScopeContextError,
  NotReadyError, NotVisibleError, OverrideError, ProviderError, RequestMissingError,
  ScopeRequiredError,
  Inject, Injectable, Module, MultiToken, Nexus, REQUEST, Token,
  all, defineModule, lazy, optional, provide,
} from '@nexusdi/core';
import type {
  All, ConfigurableModule, ConfigurableModuleConfig, CreateOptions, Dep, DepFor,
  ErrorLifetime, ExportEntry, InjectionToken, Lazy, Lifetime, LookupOptions,
  ModuleConfig, ModuleDecoratorConfig, ModuleDefinition, ModuleRef, NearMiss,
  NexusErrorCode, NexusGraph, NexusRequest, NoLifetimeMessage, Optional, OptionsFactory,
  Provider, ProviderEntries, ProviderEntry, ProviderFailure, ProviderLiteral, Resolve,
  ResolveAll, SchemaIssue, Scope, ScopeContext, StandardSchemaV1, TraceEvent, Tokens,
  DepsMap, ResolvedDeps, UntypedFunctionMessage,
} from '@nexusdi/core';
import { nodeScopeContext } from '@nexusdi/core/node';
import { createTestingContainer } from '@nexusdi/core/testing';
import type { TestingContainerBuilder, TestingCreateOptions } from '@nexusdi/core/testing';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: string;
  }
}

interface NavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');
const MISSION = new Token<string>('Mission');

class ReactorCore {
  output = 1.21;
}

@Injectable({ deps: [ReactorCore, optional(NAV_CHARTS)] })
class ShipComputer {
  @Inject(NAV_CHARTS) accessor charts!: NavCharts;
  constructor(readonly reactor: ReactorCore, readonly maybe?: NavCharts) {}
}

class PowerRouter {
  constructor(readonly shields: () => ShieldGrid) {}
}
class ShieldGrid {
  constructor(readonly router: PowerRouter) {}
}

@Module({
  providers: [
    ReactorCore,
    ShipComputer,
    provide(NAV_CHARTS, { useFactory: async () => ({ plot: (to: string) => 'course to ' + to }), deps: [] }),
    provide(PowerRouter, { deps: [lazy(ShieldGrid)] }),
    provide(ShieldGrid, { deps: [PowerRouter] }),
    { token: DIAGNOSTICS, useValue: 'hull' },
    provide(MISSION, { useFactory: (request) => request.mission, deps: [REQUEST], lifetime: 'scoped' }),
  ],
  exports: [ShipComputer, NAV_CHARTS, DIAGNOSTICS, MISSION],
})
class Engineering {}

const COURSE = new Token<string>('Course');
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering],
  providers: [{ token: COURSE, useFactory: (charts: NavCharts) => charts.plot('Vega'), deps: [NAV_CHARTS] }],
});

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error('@nexusdi/core from the packed build: ' + what);
}

{
  await using ship = await Nexus.create(Meridian, { scopeContext: nodeScopeContext() });
  check(ship.get(ShipComputer).charts.plot('Kepler') === 'course to Kepler', 'a property injection');
  check(ship.get(DIAGNOSTICS)[0] === 'hull', 'a MultiToken from a provider literal');
  check(ship.get(COURSE) === 'course to Vega', 'a factory from a provider literal');
  await using shuttle = await ship.createScope({ request: { mission: 'survey-7' } });
  const mission = await ship.runInScope(shuttle, async () => ship.currentScope()?.get(MISSION));
  check(mission === 'survey-7', 'a scoped provider through the node scope context');
  const handlerDeps = { computer: ShipComputer, mission: MISSION, checks: all(DIAGNOSTICS) } as const satisfies DepsMap;
  ship.validate(handlerDeps);
  const resolved: ResolvedDeps<typeof handlerDeps> = shuttle.resolve(handlerDeps);
  check(resolved.mission === 'survey-7' && resolved.checks[0] === 'hull', 'resolve() on a scope');
  const graph: NexusGraph = ship.graph();
  check(graph.modules.length === 2, 'graph()');
}
{
  await using fake = await createTestingContainer(Meridian)
    .override(NAV_CHARTS, { useValue: { plot: () => 'fake' } })
    .create({ onInit: false });
  check(fake.get(ShipComputer).charts.plot('x') === 'fake', 'the testing entry');
}

const errorClasses = [
  AmbiguousProviderError, AsyncTransientError, BlueprintError, CircularDependencyError,
  DisposedError, DuplicateProviderError, InvalidExportError, InvalidModuleError,
  InvalidProviderError, InvalidTokenError, LegacyDecoratorsError, LifetimeError,
  LoadedAfterScopeError, LoadError, MissingDepsError, MissingProviderError,
  ModuleImportCycleError, ModuleOptionsError, NexusError, NoScopeContextError,
  NotReadyError, NotVisibleError, OverrideError, ProviderError, RequestMissingError,
  ScopeRequiredError,
];
check(errorClasses.every((c) => typeof c === 'function') && typeof all === 'function', 'the error classes');

type EveryType = [
  All<unknown>, ConfigurableModule<unknown>, ConfigurableModuleConfig<unknown>, CreateOptions,
  Dep, DepFor<unknown>, ErrorLifetime, ExportEntry, InjectionToken<unknown>, Lazy<unknown>,
  Lifetime, LookupOptions, ModuleConfig, ModuleDecoratorConfig, ModuleDefinition, ModuleRef,
  NearMiss, NexusErrorCode, NexusGraph, NexusRequest, NoLifetimeMessage, Optional<unknown>,
  OptionsFactory<unknown, []>, Provider<unknown>, ProviderEntries<[]>, ProviderEntry,
  ProviderFailure, ProviderLiteral,
  Resolve<unknown>, ResolveAll<[]>, SchemaIssue, Scope, ScopeContext, StandardSchemaV1,
  TraceEvent, Tokens<[]>, TestingContainerBuilder, TestingCreateOptions, UntypedFunctionMessage,
];
const everyType: EveryType | undefined = undefined;
void everyType;
`;

/**
 * The two programs both bundlers build. The decorated one needs the
 * Symbol.metadata polyfill that the decorator modules import; the
 * provide()-only one imports no decorator, so its bundle must leave the
 * polyfill out. Each resolves a Token, because a bundler that renames the
 * Token class to avoid a scope collision must not break resolution.
 */
const BUNDLED = {
  decorated: `
import { Inject, Injectable, Module, Nexus, Token, provide } from '@nexusdi/core';

interface Beacon {
  signal(): string;
}
const BEACON = new Token<Beacon>('Beacon');

class ReactorCore {
  output = 1.21;
}

@Injectable({ deps: [ReactorCore] })
class Bridge {
  @Inject(BEACON) accessor beacon!: Beacon;
  constructor(readonly reactor: ReactorCore) {}
}

@Module({
  providers: [ReactorCore, Bridge, provide(BEACON, { useValue: { signal: () => 'ping' } })],
})
class Flagship {}

const ship = await Nexus.create(Flagship);
const bridge = ship.get(Bridge);
if (bridge.reactor.output !== 1.21) throw new Error('the constructor dependency did not resolve');
if (bridge.beacon.signal() !== 'ping') throw new Error('the Token property injection did not resolve');
if (ship.get(BEACON) !== bridge.beacon) throw new Error('the Token did not round-trip');
await ship[Symbol.asyncDispose]();
`,
  'provide-only': `
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

const NAME = new Token<string>('Name');
const ship = await Nexus.create(
  defineModule({ name: 'Root', providers: [provide(NAME, { useValue: 'x' })] }),
);
if (ship.get(NAME) !== 'x') throw new Error('the Token did not round-trip');
await ship[Symbol.asyncDispose]();
`,
};

/**
 * The polyfill assigns Symbol.for('Symbol.metadata'). definitions/metadata.ts
 * only reads Symbol.metadata, and esbuild's decorator helper builds its key
 * as 'Symbol.' + name, so this literal appears only where the polyfill does.
 */
const METADATA_POLYFILL = /Symbol\.for\(\s*["']Symbol\.metadata["']\s*\)/;

/** Bundles `<name>.ts` with esbuild, which applies the standard decorator transform itself. */
async function bundleWithEsbuild(name) {
  const outfile = join(dir, 'bundles', `${name}.esbuild.mjs`);
  await esbuild.build({
    entryPoints: [join(dir, `${name}.ts`)],
    outfile,
    absWorkingDir: dir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    // Pinned so no tsconfig on disk can switch on experimentalDecorators.
    tsconfigRaw: {},
    logLevel: 'silent',
  });
  return outfile;
}

/** Bundles tsc's emit of `<name>.ts` with Rollup and node-resolve. */
async function bundleWithRollup(name) {
  const file = join(dir, 'bundles', `${name}.rollup.mjs`);
  const bundle = await rollup({
    input: join(dir, 'out-bundle-input', `${name}.js`),
    plugins: [nodeResolve()],
    onwarn(warning, warn) {
      if (warning.code === 'UNRESOLVED_IMPORT')
        throw new Error(`Rollup could not resolve ${warning.exporter}`);
      warn(warning);
    },
  });
  await bundle.write({ file, format: 'esm' });
  await bundle.close();
  return file;
}

const tsconfig = (resolution) =>
  JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'es2022',
      module: resolution === 'bundler' ? 'esnext' : 'nodenext',
      moduleResolution: resolution,
      // No DOM, no esnext.disposable, no @types/node: the package's
      // declarations must bring what they use.
      lib: ['es2022'],
      types: [],
      skipLibCheck: false,
      outDir: `out-${resolution}`,
    },
    include: ['consumer.ts'],
  });

try {
  // A build from sources into an empty dist. A rebuild and a cache hit both
  // leave a stale file in dist, and npm pack would include it, so dist is
  // cleared and the Nx cache is skipped. Only the published packages build:
  // nothing here reads an example's output.
  console.log('Clearing build output…');
  for (const [libDir] of LIBS)
    rmSync(join(ROOT, libDir, 'dist'), { recursive: true, force: true });

  console.log('Building libraries…');
  run(
    'npx',
    [
      'nx',
      'run-many',
      '-t',
      'build',
      '-p',
      ...LIBS.map(([, name]) => name),
      '--skip-nx-cache',
    ],
    ROOT,
  );

  console.log(`Packing into ${dir}`);
  for (const [libDir] of LIBS)
    run('npm', ['pack', '--pack-destination', dir], join(ROOT, libDir));
  const tarballs = readdirSync(dir).filter((f) => f.endsWith('.tgz'));
  if (tarballs.length !== LIBS.length)
    throw new Error(
      `expected ${LIBS.length} tarball(s), found ${tarballs.length}`,
    );

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'packaging-check', private: true, type: 'module' }),
  );
  writeFileSync(join(dir, 'consumer.ts'), CONSUMER);
  writeFileSync(join(dir, 'cjs-consumer.cjs'), CJS_CONSUMER);
  for (const [name, source] of Object.entries(BUNDLED))
    writeFileSync(join(dir, `${name}.ts`), source);
  writeFileSync(join(dir, 'tsconfig.nodenext.json'), tsconfig('nodenext'));
  writeFileSync(join(dir, 'tsconfig.bundler.json'), tsconfig('bundler'));
  writeFileSync(
    join(dir, 'tsconfig.bundle-input.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        lib: ['es2022'],
        types: [],
        skipLibCheck: false,
        outDir: 'out-bundle-input',
      },
      include: Object.keys(BUNDLED).map((name) => `${name}.ts`),
    }),
  );

  console.log('Installing tarball…');
  run(
    'npm',
    [
      'install',
      '--silent',
      '--no-audit',
      '--no-fund',
      ...tarballs.map((t) => `./${t}`),
      'typescript@6',
    ],
    dir,
  );

  console.log('Type-checking a strict consumer…');
  run('npx', ['tsc', '-p', 'tsconfig.nodenext.json'], dir);
  console.log(
    '  ✓ ., ./node and ./testing resolve with types under nodenext, with lib es2022 and no @types/node',
  );
  run('npx', ['tsc', '-p', 'tsconfig.bundler.json', '--noEmit'], dir);
  console.log(
    '  ✓ the same consumer type-checks under moduleResolution bundler',
  );

  // tsc resolves through the `types` condition, node through `import`, and the
  // two point at different files. Running the emitted consumer checks the second.
  console.log('Running the consumer…');
  run('node', [join(dir, 'out-nodenext', 'consumer.js')], dir);
  console.log(
    '  ✓ a decorated class, scopes, the node entry and the testing entry run from the packed build',
  );

  console.log('Checking the published modules for top-level await…');
  const ts = createRequire(join(dir, 'package.json'))('typescript');
  const coreDist = join(dir, 'node_modules', '@nexusdi', 'core', 'dist');
  const awaiting = modulesUnder(coreDist).filter((file) =>
    hasTopLevelAwait(ts, file, readFileSync(file, 'utf8')),
  );
  if (awaiting.length)
    throw new Error(
      `top-level await makes require() throw ERR_REQUIRE_ASYNC_MODULE:\n${awaiting.join('\n')}`,
    );
  console.log('  ✓ no published module uses top-level await');

  console.log('Requiring every entry from CommonJS…');
  for (const version of CJS_NODE_VERSIONS) {
    const printed = run(
      'npx',
      ['--yes', `node@${version}`, join(dir, 'cjs-consumer.cjs')],
      dir,
    ).trim();
    if (!printed.startsWith(version))
      throw new Error(
        `expected Node ${version}, the consumer ran on ${printed}`,
      );
    console.log(
      `  ✓ Node ${printed}: require() loads ., ./testing and ./node, and each resolves`,
    );
  }

  // Both bundlers honour the sideEffects list, which is the only thing that
  // keeps the polyfill out of a program that imports no decorator. Running
  // each bundle checks that resolution survives the bundler's renaming.
  console.log('Bundling a decorated and a provide()-only program…');
  run('npx', ['tsc', '-p', 'tsconfig.bundle-input.json'], dir);
  for (const [bundler, bundle] of [
    ['esbuild', bundleWithEsbuild],
    ['Rollup', bundleWithRollup],
  ]) {
    const decorated = await bundle('decorated');
    if (!METADATA_POLYFILL.test(readFileSync(decorated, 'utf8')))
      throw new Error(
        `the ${bundler} bundle of a decorated program lost the Symbol.metadata polyfill`,
      );
    run('node', [decorated], dir);
    console.log(
      `  ✓ ${bundler}: a decorated bundle keeps the Symbol.metadata polyfill and resolves its deps and a Token`,
    );

    const provideOnly = await bundle('provide-only');
    if (METADATA_POLYFILL.test(readFileSync(provideOnly, 'utf8')))
      throw new Error(
        `the ${bundler} bundle of a program that imports no decorator contains the Symbol.metadata polyfill; sideEffects or the decorators/ import boundary regressed`,
      );
    run('node', [provideOnly], dir);
    console.log(
      `  ✓ ${bundler}: a provide()-only bundle contains no Symbol.metadata assignment and resolves a Token`,
    );
  }

  // A helper tsc emits under `importHelpers` becomes an import of tslib, which
  // the consumer must have installed. tools/repo-checks/src/tslib-dependency.test.ts
  // checks the setting; this checks the emit.
  console.log('Checking tslib declarations against the packed output…');
  const tslibProblems = [];
  for (const [, name] of LIBS) {
    const pkgRoot = join(dir, 'node_modules', ...name.split('/'));
    const manifest = JSON.parse(
      readFileSync(join(pkgRoot, 'package.json'), 'utf8'),
    );
    const declared = 'tslib' in (manifest.dependencies ?? {});
    const importers = modulesUnder(join(pkgRoot, 'dist')).filter((file) =>
      /(?:from|import|require\s*\()\s*["']tslib(?:\/[^"']*)?["']/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    if (importers.length && !declared)
      tslibProblems.push(
        `${name} imports tslib from ${importers.length} module(s) but declares no tslib dependency`,
      );
    if (!importers.length && declared)
      tslibProblems.push(
        `${name} declares tslib but no module in its published output imports it`,
      );
  }
  if (tslibProblems.length) throw new Error(tslibProblems.join('\n'));
  console.log('  ✓ tslib is declared by exactly the packages that import it');

  // The @nexusdi/source condition must come first in every entry, so node's
  // default conditions never select source.
  const corePkg = JSON.parse(
    readFileSync(
      join(dir, 'node_modules', '@nexusdi', 'core', 'package.json'),
      'utf8',
    ),
  );
  for (const entry of CORE_ENTRIES) {
    const conditions = Object.keys(corePkg.exports[entry] ?? {});
    if (conditions[0] !== '@nexusdi/source')
      throw new Error(`exports["${entry}"] must list @nexusdi/source first`);
    if (!conditions.includes('types') || !conditions.includes('import'))
      throw new Error(`exports["${entry}"] lost its types or import condition`);
    if (!conditions.includes('default'))
      throw new Error(
        `exports["${entry}"] lost its default condition, which require(esm) resolves through`,
      );
    if (conditions.includes('require'))
      throw new Error(
        `exports["${entry}"] has a require condition; the package is ESM only (spec section 12)`,
      );
  }
  console.log(
    '  ✓ every entry lists @nexusdi/source first, keeps types, import and default, and has no require condition',
  );

  console.log('\nPackaging verified.');
} catch (error) {
  failed = true;
  console.error('\nPackaging check FAILED\n');
  console.error(error.stdout || error.message);
  if (error.stderr) console.error(error.stderr);
  if (error.errors?.length) console.error(error.errors);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
