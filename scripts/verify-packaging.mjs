#!/usr/bin/env node
/**
 * Stages every published package as `nx release publish` does (the
 * stage-publish target, tools/release/stage.mjs), packs the staged copies,
 * installs the tarballs into a throwaway project outside the workspace, and
 * checks that a consumer can import them and see their types, and that Go to
 * Definition and a source-mapped stack trace reach the shipped src.
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
import { execFileSync, spawn } from 'node:child_process';
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
import { PUBLISH_ROOT, stagedProblems } from '@nexusdi/release';
import { packageFiles } from '../tools/release/package-files.mjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import * as esbuild from 'esbuild';
import { rollup } from 'rollup';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Every published package, as `[directory, package name]`. The package name
 * is also the Nx project name the build step selects.
 */
const LIBS = [
  ['libs/core', '@nexusdi/core'],
  ['libs/errors', '@nexusdi/errors'],
  ['libs/testing', '@nexusdi/testing'],
  ['libs/node', '@nexusdi/node'],
  ['libs/devtools', '@nexusdi/devtools'],
  ['libs/interceptors', '@nexusdi/interceptors'],
  ['libs/cli', '@nexusdi/cli'],
  ['libs/decorators', '@nexusdi/decorators'],
  ['libs/federation', '@nexusdi/federation'],
];

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
 * an ES module without a flag. It requires every entry and uses each.
 */
const CJS_CONSUMER = `'use strict';
const { Nexus, Token, defineModule, provide } = require('@nexusdi/core');
const { coreText } = require('@nexusdi/core/text');
const { createTestingContainer } = require('@nexusdi/testing');
const { nodeScopes } = require('@nexusdi/node');
const { errors } = require('@nexusdi/errors');
const { Inject, Injectable, Module } = require('@nexusdi/decorators');
const { defineContract, federation } = require('@nexusdi/federation');
const { federationText } = require('@nexusdi/federation/text');
const { interceptorsText } = require('@nexusdi/interceptors/text');

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
  if (typeof coreText !== 'object' || coreText === null)
    throw new Error('require(esm): @nexusdi/core/text has no coreText');
  if (typeof federationText !== 'object' || federationText === null)
    throw new Error('require(esm): @nexusdi/federation/text has no federationText');
  if (typeof interceptorsText !== 'object' || interceptorsText === null)
    throw new Error('require(esm): @nexusdi/interceptors/text has no interceptorsText');
  const ship = await Nexus.create(Engineering, {
    plugins: [errors()],
  });
  if (ship.get(REACTOR).output !== 1.21)
    throw new Error('require(esm): the provider did not resolve');
  const scopes = nodeScopes();
  const shuttle = await ship.createScope();
  const bound = await scopes.run(
    shuttle,
    async () => scopes.current() === shuttle,
  );
  if (!bound) throw new Error('require(esm): @nexusdi/node did not bind the scope');
  await shuttle[Symbol.asyncDispose]();
  await ship[Symbol.asyncDispose]();

  const fake = await createTestingContainer(Engineering)
    .override(REACTOR, { useClass: FakeReactor })
    .create();
  if (fake.get(REACTOR).output !== 0)
    throw new Error('require(esm): @nexusdi/testing did not override');
  await fake[Symbol.asyncDispose]();
  if (![Inject, Injectable, Module].every((d) => typeof d === 'function'))
    throw new Error('require(esm): @nexusdi/decorators lost a decorator');

  const shellBank = defineContract({ key: 'bank', version: '2.3.0' });
  const remoteBank = defineContract({ key: 'bank', version: '2.1.0' });
  const shell = await Nexus.create(
    defineModule({
      name: 'Shell',
      providers: [provide(shellBank.token('Auth'), { useValue: 'ada' })],
    }),
    { plugins: [federation()] },
  );
  if (shell.get(remoteBank.token('Auth')) !== 'ada')
    throw new Error('require(esm): @nexusdi/federation did not bind a contract copy');
  await shell[Symbol.asyncDispose]();
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

/**
 * Throws unless an exports entry, named by `where`, lists `conditions` as
 * the spec requires: types, import and default, and no require condition.
 * The repo's manifest also lists @nexusdi/source first, so node's default
 * conditions never select source in the workspace; the published manifest
 * lists it nowhere (tools/release/stage.mjs strips it).
 */
function checkEntry(where, conditions, { source }) {
  if (source && conditions[0] !== '@nexusdi/source')
    throw new Error(`${where} must list @nexusdi/source first`);
  if (!source && conditions.includes('@nexusdi/source'))
    throw new Error(`${where} publishes the workspace-only @nexusdi/source`);
  if (!conditions.includes('types') || !conditions.includes('import'))
    throw new Error(`${where} lost its types or import condition`);
  if (!conditions.includes('default'))
    throw new Error(
      `${where} lost its default condition, which require(esm) resolves through`,
    );
  if (conditions.includes('require'))
    throw new Error(
      `${where} has a require condition; the package is ESM only (spec section 12)`,
    );
}

/**
 * The file tsserver opens for Go to Definition at `position` (1-based line
 * and offset) in a consumer file holding `text`, or null when it finds none.
 * tsserver answers once the project has loaded, so stdin stays open until
 * the definition response arrives.
 */
function goToDefinition(cwd, text, position) {
  const file = join(cwd, 'goto.ts');
  writeFileSync(file, text);
  writeFileSync(
    join(cwd, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        types: [],
        noEmit: true,
      },
      files: ['goto.ts'],
    }),
  );
  const tsserver = createRequire(join(cwd, 'package.json')).resolve(
    'typescript/lib/tsserver.js',
  );
  return new Promise((resolveFile, reject) => {
    const child = spawn(
      'node',
      [tsserver, '--disableAutomaticTypingAcquisition'],
      { cwd, stdio: ['pipe', 'pipe', 'inherit'] },
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('tsserver gave no definition within 60s'));
    }, 60_000);
    // tsserver frames each message as a Content-Length header, a blank line
    // and that many bytes of JSON. A chunk can end anywhere in a message.
    let buffer = Buffer.alloc(0);
    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const header = /^Content-Length: (\d+)\r?\n\r?\n/.exec(
          buffer.toString('latin1', 0, Math.min(buffer.length, 64)),
        );
        if (header === null) return;
        const start = header[0].length;
        const end = start + Number(header[1]);
        if (buffer.length < end) return;
        const message = JSON.parse(buffer.toString('utf8', start, end));
        buffer = buffer.subarray(end);
        if (message.type !== 'response' || message.request_seq !== 2) continue;
        clearTimeout(timer);
        child.kill();
        resolveFile(message.body?.[0]?.file ?? null);
        return;
      }
    });
    child.on('error', reject);
    for (const [seq, command, args] of [
      [1, 'open', { file }],
      [2, 'definition', { file, ...position }],
    ])
      child.stdin.write(
        `${JSON.stringify({ seq, type: 'request', command, arguments: args })}\n`,
      );
  });
}

/** Names every public export, so tsc fails on one that stopped being exported. */
const CONSUMER = `
import {
  AmbiguousProviderError, AsyncTransientError, BlueprintError, CircularDependencyError,
  DisposedError, DuplicateProviderError, InvalidExportError, InvalidModuleError,
  InvalidProviderError, InvalidTokenError, LifetimeError,
  LoadedAfterScopeError, LoadError, MissingDepsError, MissingProviderError,
  ModuleImportCycleError, ModuleOptionsError, NexusError,
  NotReadyError, NotVisibleError, ProviderError, RequestMissingError,
  ScopeRequiredError,
  MultiToken, Nexus, REQUEST, Token,
  all, declareClass, declareModuleClass, declareProperty, defineModule, lazy,
  moduleDefinitionOf, optional, provide,
} from '@nexusdi/core';
import type {
  All, ConfigurableModule, ConfigurableModuleConfig, CreateOptions, Ctor, Dep, DepFor, DepsFor,
  ErrorLifetime, ExportEntry, FactoryDefinition, ForRootAsyncConfig, InjectionToken, Lazy, Lifetime, LookupOptions,
  ModuleConfig, ModuleDefinition, ModuleRef, NearMiss,
  NexusErrorCode, NexusRequest, NoLifetimeMessage, Optional,
  OverrideDefinition, PromiseTokenMessage, Provider, ProviderEntries, ProviderEntry, ProviderFailure, ProviderLiteral, Resolve,
  ResolveAll, SchemaIssue, Scope, StandardSchemaV1, Tokens,
  DepsMap, ResolvedDeps, UntypedFunctionMessage,
} from '@nexusdi/core';
import { coreText, layoutText } from '@nexusdi/core/text';
import { Inject, Injectable, LegacyDecoratorsError, Module } from '@nexusdi/decorators';
import type { ModuleDecoratorConfig } from '@nexusdi/decorators';
import { nodeScopes } from '@nexusdi/node';
import type { NodeScopes } from '@nexusdi/node';
import { OverrideError, createTestingContainer } from '@nexusdi/testing';
import type {
  ModuleOverrideOptions, TestingContainerBuilder, TestingCreateOptions,
} from '@nexusdi/testing';
import { errors, explain } from '@nexusdi/errors';
import { devtools, graph, trace } from '@nexusdi/devtools';
import type { NexusGraph, TraceEvent } from '@nexusdi/devtools';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { Interceptor } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';
import { ContractVersionError, defineContract, federation } from '@nexusdi/federation';
import type { Contract } from '@nexusdi/federation';
import { federationText } from '@nexusdi/federation/text';

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
  const events: TraceEvent[] = [];
  await using ship = await Nexus.create(Meridian, {
    plugins: [devtools(), trace((event) => events.push(event))],
  });
  check(ship.get(ShipComputer).charts.plot('Kepler') === 'course to Kepler', 'a property injection');
  check(ship.get(DIAGNOSTICS)[0] === 'hull', 'a MultiToken from a provider literal');
  check(ship.get(COURSE) === 'course to Vega', 'a factory from a provider literal');
  const scopes = nodeScopes();
  await using shuttle = await ship.createScope({ request: { mission: 'survey-7' } });
  const mission = await scopes.run(shuttle, async () => scopes.current()?.get(MISSION));
  check(mission === 'survey-7', 'a scoped provider through @nexusdi/node');
  const handlerDeps = { computer: ShipComputer, mission: MISSION, checks: all(DIAGNOSTICS) } as const satisfies DepsMap;
  ship.validate(handlerDeps);
  const resolved: ResolvedDeps<typeof handlerDeps> = shuttle.resolve(handlerDeps);
  check(resolved.mission === 'survey-7' && resolved.checks[0] === 'hull', 'resolve() on a scope');
  const view: NexusGraph = graph(ship);
  check(view.modules.length === 2, '@nexusdi/devtools graph()');
  check(events[0]?.type === 'compile', '@nexusdi/devtools trace()');
}
{
  const GREETING = new Token<{ say(): string }>('Greeting');
  const SHOUT = new Token<Interceptor>('Shout');
  await using shouting = await Nexus.create(
    defineModule({
      name: 'Shout',
      providers: [provide(GREETING, { useFactory: () => ({ say: () => 'hi' }) })],
      exports: [GREETING],
    }),
    {
      plugins: [
        interceptors({
          register: [interceptor(SHOUT, { useValue: { intercept: (_c, next) => String(next()).toUpperCase() } })],
          bindings: [{ token: GREETING, methods: { say: [SHOUT] } }],
        }),
      ],
    },
  );
  check(shouting.get(GREETING).say() === 'HI', '@nexusdi/interceptors interceptors()');
  const LOST = new Token<Interceptor>('Lost');
  const refused = await Nexus.create(defineModule({ name: 'Quiet' }), {
    plugins: [
      errors({ text: [interceptorsText] }),
      interceptors({
        register: [interceptor(SHOUT, { useValue: { intercept: (_c, next) => next() } })],
        global: [LOST],
      }),
    ],
  }).then(
    () => undefined,
    (caught: unknown) => caught as BlueprintError,
  );
  check(
    refused?.errors[0]?.message ===
      '[NEXUS_INTERCEPTOR_MISSING] a global entry or binding uses the interceptor Lost, which is not registered.\\n  Fix: add Lost to interceptors({ register }).',
    '@nexusdi/interceptors/text words a missing interceptor',
  );
}
{
  await using fake = await createTestingContainer(Meridian)
    .override(NAV_CHARTS, { useValue: { plot: () => 'fake' } })
    .create({ onInit: false });
  check(fake.get(ShipComputer).charts.plot('x') === 'fake', '@nexusdi/testing');
  check(moduleDefinitionOf(Engineering)?.name === 'Engineering', 'moduleDefinitionOf');
}
{
  class Probe {
    constructor(readonly reactor: ReactorCore) {}
    charts?: NavCharts;
  }
  const metadata = Object.create(null) as DecoratorMetadataObject;
  declareClass(metadata, { deps: [ReactorCore], lifetime: 'transient' });
  declareProperty(metadata, 'charts', NAV_CHARTS);
  // lib es2022 does not type Symbol.metadata; @nexusdi/decorators' polyfill,
  // loaded above, defines it.
  const METADATA = (Symbol as unknown as { metadata: symbol }).metadata;
  Object.defineProperty(Probe, METADATA, { value: metadata });
  const Survey = declareModuleClass(class Survey {}, {
    name: 'Survey',
    imports: [Engineering],
    providers: [ReactorCore, Probe],
  });
  await using ship = await Nexus.create(Survey);
  check(
    ship.get(Probe).charts?.plot('Vega') === 'course to Vega' && ship.get(Probe) !== ship.get(Probe),
    'the class metadata functions',
  );
}
{
  const broken = defineModule({ name: 'Broken', providers: [ShipComputer] });
  const error = await Nexus.create(broken, { plugins: [errors()] }).catch(
    (caught: unknown) => caught as BlueprintError,
  );
  check(
    error instanceof BlueprintError &&
      error.errors[0]?.message.includes('Fix:') === true &&
      explain(error.errors[0]) !== undefined,
    '@nexusdi/errors formats a compile error',
  );
  const inner = error instanceof BlueprintError ? error.errors[0] : undefined;
  const text = inner === undefined ? undefined : explain(inner);
  check(
    typeof coreText.NEXUS_MISSING_DEPS === 'function' &&
      text !== undefined &&
      layoutText(inner?.code ?? '', text) === inner?.message,
    '@nexusdi/core/text lays out the text errors() wrote',
  );
}

{
  interface IAuth {
    user(): string;
  }
  const shellBank: Contract = defineContract({ key: 'bank', version: '2.3.0' });
  const remoteBank = defineContract({ key: 'bank', version: '2.4.0' });
  const AUTH = shellBank.token<IAuth>('Auth');
  await using shell = await Nexus.create(
    defineModule({
      name: 'Shell',
      providers: [provide(AUTH, { useValue: { user: () => 'ada' } })],
      exports: [AUTH],
      global: true,
    }),
    { plugins: [federation()] },
  );
  check(shell.get(defineContract({ key: 'bank', version: '2.1.0' }).token<IAuth>('Auth')).user() === 'ada', '@nexusdi/federation binds a contract copy');
  class Transfers {
    static deps = [remoteBank.token<IAuth>('Auth')] as const;
    constructor(readonly auth: IAuth) {}
  }
  const refused = await shell
    .load(defineModule({ name: 'Transfers', providers: [Transfers] }))
    .catch((caught: unknown) => caught as BlueprintError);
  check(refused?.errors[0] instanceof ContractVersionError, '@nexusdi/federation reports a newer minor');
  const mismatch = refused?.errors[0];
  check(
    mismatch !== undefined &&
      explain(mismatch, { text: [federationText] })?.message ===
        'bank/Auth is needed at 2.4.0, and the provider has 2.3.0.',
    '@nexusdi/federation/text explains a contract mismatch',
  );
}

const errorClasses = [
  AmbiguousProviderError, AsyncTransientError, BlueprintError, CircularDependencyError,
  DisposedError, DuplicateProviderError, InvalidExportError, InvalidModuleError,
  InvalidProviderError, InvalidTokenError, LegacyDecoratorsError, LifetimeError,
  LoadedAfterScopeError, LoadError, MissingDepsError, MissingProviderError,
  ModuleImportCycleError, ModuleOptionsError, NexusError,
  NotReadyError, NotVisibleError, ProviderError, RequestMissingError,
  ScopeRequiredError, OverrideError, LegacyDecoratorsError, ContractVersionError,
];
check(errorClasses.every((c) => typeof c === 'function') && typeof all === 'function', 'the error classes');

type EveryType = [
  All<unknown>, ConfigurableModule<unknown>, ConfigurableModuleConfig<unknown>, CreateOptions,
  Dep, DepFor<unknown>, ErrorLifetime, ExportEntry, InjectionToken<unknown>, Lazy<unknown>,
  Lifetime, LookupOptions, ModuleConfig, ModuleDecoratorConfig, ModuleDefinition, ModuleRef,
  Ctor, DepsFor<new () => unknown>,
  NearMiss, NexusErrorCode, NexusGraph, NexusRequest, NoLifetimeMessage, Optional<unknown>,
  ForRootAsyncConfig<unknown, []>, Provider<unknown>, ProviderEntries<[]>, ProviderEntry,
  ProviderFailure, ProviderLiteral,
  Resolve<unknown>, ResolveAll<[]>, SchemaIssue, Scope, StandardSchemaV1,
  TraceEvent, Tokens<[]>, TestingContainerBuilder, TestingCreateOptions, UntypedFunctionMessage,
  NodeScopes,
  ModuleOverrideOptions, FactoryDefinition<[], unknown>, OverrideDefinition<unknown, new () => unknown>,
  PromiseTokenMessage,
];
const everyType: EveryType | undefined = undefined;
void everyType;
`;

/**
 * The two programs both bundlers build. The decorated one needs the
 * Symbol.metadata polyfill that @nexusdi/decorators' decorator modules
 * import; the provide()-only one imports only @nexusdi/core, which ships no
 * such polyfill, so its bundle contains none. Each resolves a Token, because a bundler that renames the
 * Token class to avoid a scope collision must not break resolution.
 */
const BUNDLED = {
  decorated: `
import { Nexus, Token, provide } from '@nexusdi/core';
import { Inject, Injectable, Module } from '@nexusdi/decorators';

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
 * @nexusdi/decorators' polyfill assigns Symbol.for('Symbol.metadata'). Core's
 * definitions/metadata.ts only reads Symbol.metadata, and esbuild's decorator
 * helper builds its key as 'Symbol.' + name, so this literal appears only
 * where the polyfill does.
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

  // stage-publish builds each package and copies it, as npm packs it, to
  // tmp/publish/<projectRoot> with the workspace-only manifest fields
  // stripped. `nx release publish` publishes that copy, so it is what this
  // script packs.
  console.log('Building and staging libraries…');
  for (const [libDir] of LIBS)
    rmSync(join(ROOT, PUBLISH_ROOT, libDir), { recursive: true, force: true });
  run(
    'npx',
    [
      'nx',
      'run-many',
      '-t',
      'stage-publish',
      '-p',
      ...LIBS.map(([, name]) => name),
      '--skip-nx-cache',
    ],
    ROOT,
  );

  console.log(`Packing into ${dir}`);
  for (const [libDir] of LIBS)
    run(
      'npm',
      ['pack', '--pack-destination', dir],
      join(ROOT, PUBLISH_ROOT, libDir),
    );
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
    '  ✓ ., @nexusdi/decorators, @nexusdi/node, @nexusdi/testing, @nexusdi/devtools, @nexusdi/federation and @nexusdi/interceptors resolve with types under nodenext, with lib es2022 and no @types/node',
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
    '  ✓ a decorated class, the class metadata functions, scopes, @nexusdi/node, @nexusdi/testing, @nexusdi/devtools, @nexusdi/federation and @nexusdi/interceptors run from the packed build',
  );

  // The bin as published: its shebang, and the rule that it loads the
  // project's @nexusdi/devtools and core, both installed here from tarballs.
  console.log('Running the nexusdi bin…');
  writeFileSync(
    join(dir, 'meridian.module.js'),
    `import { Token, defineModule, provide } from '@nexusdi/core';
const NAV_CHARTS = new Token('NavCharts');
class StellarCharts {}
export default defineModule({
  name: 'Meridian',
  providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
});
`,
  );
  const mermaid = run(
    'npx',
    ['--no', 'nexusdi', 'graph', 'meridian.module.js'],
    dir,
  );
  if (
    !mermaid.startsWith('flowchart LR\n') ||
    !mermaid.includes('StellarCharts')
  )
    throw new Error(`nexusdi graph printed:\n${mermaid}`);
  console.log(
    '  ✓ npx nexusdi graph runs from the packed build and graphs the project',
  );

  console.log('Checking the published modules for top-level await…');
  const ts = createRequire(join(dir, 'package.json'))('typescript');
  const awaiting = LIBS.flatMap(([, name]) =>
    modulesUnder(join(dir, 'node_modules', ...name.split('/'), 'dist')),
  ).filter((file) => hasTopLevelAwait(ts, file, readFileSync(file, 'utf8')));
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
      `  ✓ Node ${printed}: require() loads every entry, and each resolves`,
    );
  }

  // The decorated bundle must keep the polyfill @nexusdi/decorators lists in
  // sideEffects, and the provide()-only bundle, which imports only
  // @nexusdi/core, must contain none. Running each bundle checks that
  // resolution survives the bundler's renaming.
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
        `the ${bundler} bundle of a program that imports only @nexusdi/core contains the Symbol.metadata polyfill; core must ship none`,
      );
    run('node', [provideOnly], dir);
    console.log(
      `  ✓ ${bundler}: a provide()-only bundle of @nexusdi/core contains no Symbol.metadata assignment and resolves a Token`,
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

  // Every optional package pins its peer dependency on core to core's
  // version exactly (spec section 17), read from the packed manifests.
  const packedManifest = (name) =>
    JSON.parse(
      readFileSync(
        join(dir, 'node_modules', ...name.split('/'), 'package.json'),
        'utf8',
      ),
    );
  const coreVersion = packedManifest('@nexusdi/core').version;
  for (const [, name] of LIBS) {
    if (name === '@nexusdi/core') continue;
    const peer = packedManifest(name).peerDependencies?.['@nexusdi/core'];
    if (peer !== coreVersion)
      throw new Error(
        `${name} peers on @nexusdi/core ${peer ?? '(none)'}; it must be exactly ${coreVersion}`,
      );
  }
  console.log(
    `  ✓ every optional package peers on @nexusdi/core ${coreVersion} exactly`,
  );
  if (packedManifest('@nexusdi/core').exports?.['./testing'] !== undefined)
    throw new Error(
      '@nexusdi/core publishes ./testing; the testing container is @nexusdi/testing',
    );
  console.log('  ✓ @nexusdi/core publishes no ./testing entry');

  // The repo's manifests list @nexusdi/source first in every entry; the
  // published ones do not list it at all.
  for (const [libDir, name] of LIBS) {
    const repoManifest = JSON.parse(
      readFileSync(join(ROOT, libDir, 'package.json'), 'utf8'),
    );
    for (const [source, manifest] of [
      [true, repoManifest],
      [false, packedManifest(name)],
    ]) {
      if (manifest.exports?.['.'] === undefined && manifest.bin === undefined)
        throw new Error(`${name} has no "." entry in its exports map`);
      for (const [entry, target] of Object.entries(manifest.exports)) {
        if (entry === './package.json') continue;
        checkEntry(`${name} exports["${entry}"]`, Object.keys(target), {
          source,
        });
      }
    }
  }
  console.log(
    '  ✓ every repo entry lists @nexusdi/source first, no published entry lists it, and each keeps types, import and default with no require condition',
  );

  // The installed package is the tarball's contents. Every path its
  // manifest names, every source a .map names and every sourceMappingURL
  // must be in it.
  const problems = LIBS.flatMap(([libDir, name]) => {
    const pkgRoot = join(dir, 'node_modules', ...name.split('/'));
    return stagedProblems({
      manifest: packedManifest(name),
      repoVersion: JSON.parse(
        readFileSync(join(ROOT, libDir, 'package.json'), 'utf8'),
      ).version,
      files: packageFiles(pkgRoot),
      read: (path) => readFileSync(join(pkgRoot, path), 'utf8'),
    });
  });
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(
    '  ✓ every path a published manifest, .map or sourceMappingURL names is in its tarball',
  );

  // The declaration maps lead an editor into the shipped TypeScript source.
  // tsserver, which editors run, maps a .d.ts location through its .d.ts.map;
  // the plain language service API does not.
  console.log('Asking tsserver for Go to Definition…');
  const definition = await goToDefinition(
    dir,
    "import { Nexus } from '@nexusdi/core';\nNexus;\n",
    { line: 2, offset: 1 },
  );
  if (!/node_modules\/@nexusdi\/core\/src\/.+\.ts$/.test(definition ?? ''))
    throw new Error(
      `Go to Definition on Nexus resolved to ${definition ?? 'nothing'}, outside node_modules/@nexusdi/core/src`,
    );
  console.log(
    `  ✓ Go to Definition on Nexus opens ${definition.slice(definition.lastIndexOf('node_modules/'))}`,
  );

  // The source maps lead a stack trace into the same src.
  console.log('Throwing from core under --enable-source-maps…');
  writeFileSync(
    join(dir, 'trace.mjs'),
    `import { Nexus, Token, defineModule } from '@nexusdi/core';
const ship = await Nexus.create(defineModule({ name: 'Empty' }));
try {
  ship.get(new Token('Missing'));
} catch (error) {
  console.log(error.stack);
}
`,
  );
  const stack = run('node', ['--enable-source-maps', 'trace.mjs'], dir);
  if (!/node_modules\/@nexusdi\/core\/src\/[^:]+\.ts:\d+:\d+/.test(stack))
    throw new Error(
      `the stack trace has no frame in the shipped src:\n${stack}`,
    );
  console.log('  ✓ a stack trace from core maps to its shipped .ts source');

  // @nexusdi/meridian-ui is private and never installed by a consumer, so it
  // gets no install check. Its packed entry is still read, because the React
  // allowlist is the package's one promise and a bundler can reintroduce an
  // import the source does not show. src/react-imports.test.ts holds the
  // same literal and compares the two. The stage-publish run above covers
  // libs/ only, so the package builds here, from sources (vite empties dist).
  console.log('Building and packing @nexusdi/meridian-ui…');
  const meridianAllowed = {
    react: ['createElement', 'Fragment'],
    'react/jsx-runtime': ['jsx', 'jsxs', 'jsxDEV', 'Fragment'],
  };
  run(
    'npx',
    ['nx', 'run', '@nexusdi/meridian-ui:build', '--skip-nx-cache'],
    ROOT,
  );
  const meridianDir = mkdtempSync(join(tmpdir(), 'nexusdi-meridian-'));
  try {
    run(
      'npm',
      ['pack', '--pack-destination', meridianDir],
      join(ROOT, 'internal/meridian-ui'),
    );
    const meridianTarball = readdirSync(meridianDir).find((f) =>
      f.endsWith('.tgz'),
    );
    if (!meridianTarball)
      throw new Error('npm pack wrote no @nexusdi/meridian-ui tarball');
    run('tar', ['-xzf', meridianTarball], meridianDir);
    const meridianEntry = readFileSync(
      join(meridianDir, 'package', 'dist', 'index.js'),
      'utf8',
    );
    const meridianOffenders = [];
    for (const match of meridianEntry.matchAll(
      /import\s*(?:\{([^}]*)\}|(\*\s+as\s+\w+|\w+))\s*from\s*["']([^"']+)["']/g,
    )) {
      const module = match[3];
      if (!/^react(?:$|\/|-dom)/.test(module)) continue;
      const allowed = meridianAllowed[module];
      if (!allowed) {
        meridianOffenders.push(`${module} (whole module)`);
        continue;
      }
      const specifiers = (match[1] ?? '')
        .split(',')
        .map((specifier) =>
          specifier
            .trim()
            .split(/\s+as\s+/)[0]
            .trim(),
        )
        .filter(Boolean);
      for (const specifier of specifiers) {
        if (!allowed.includes(specifier)) {
          meridianOffenders.push(`${specifier} from ${module}`);
        }
      }
    }
    if (meridianOffenders.length) {
      throw new Error(
        '@nexusdi/meridian-ui dist/index.js imports React APIs outside its ' +
          'allowlist: ' +
          meridianOffenders.join(', ') +
          '. The package is stateless: it imports no hook and no context.',
      );
    }
    if (/(?:from|import)\s*["'][^"']+\.css["']/.test(meridianEntry)) {
      throw new Error(
        '@nexusdi/meridian-ui dist/index.js imports a stylesheet. The docs app ' +
          'imports @nexusdi/meridian-ui/styles.css once in global.css.',
      );
    }
  } finally {
    rmSync(meridianDir, { recursive: true, force: true });
  }
  console.log('  ✓ meridian-ui imports only createElement-level React APIs');

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
