#!/usr/bin/env node
/**
 * Packs @nexusdi/core, installs the tarball into a throwaway project outside
 * the workspace, and checks that a consumer can import it and see its types.
 *
 * Nothing inside the repo can tell whether the package resolves as published.
 * tsconfig.base.json sets `customConditions: ["@nexusdi/source"]`, so every
 * in-workspace import reaches the package's TypeScript source and the exports
 * map, the emitted declarations and the build output are all bypassed. The
 * package can therefore typecheck, test and lint clean while exporting
 * nothing a consumer can reach -- an extensionless relative specifier in an
 * emitted .d.ts is enough, because `moduleResolution: nodenext` requires the
 * extension.
 *
 * Everything that only exists once the package is packed is checked here: the
 * exports map, the conditions in it, the declarations as emitted, the entry
 * point, and the imports the compiler left in the output.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Every package whose packed output is checked, as `[directory, package
 * name]`. That is `libs/*`, which npm publishes. A package missing from this
 * list is packed by nothing and checked by nothing; the count is asserted
 * after packing so a failed `npm pack` cannot pass as a shorter list.
 */
const LIBS = [['libs/core', '@nexusdi/core']];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

const dir = mkdtempSync(join(tmpdir(), 'nexusdi-packaging-'));
let failed = false;

try {
  // CI builds from a checkout that has no `dist` at all. Here `dist` is
  // whatever the last local build left, and `nx build` empties it at no
  // point: a file planted in `libs/core/dist` survives a rebuild, which
  // overwrites what it emits and touches nothing else, and survives a cache
  // hit, which restores the cached outputs alongside what is already on
  // disk. A source file deleted since the last build therefore leaves its
  // JavaScript behind, `npm pack` ships it, and every check below reports on
  // a tarball that cannot be published.
  //
  // Both halves are needed. Clearing alone is not enough, because a build
  // that ran against a dirty `dist` cached the stale file as part of its
  // output, and that cache entry is keyed on the sources as they are now --
  // so the build after the clean hits it and puts the file straight back.
  // `--skip-nx-cache` alone is not enough either, since a rebuild does not
  // prune. Together they give a build from sources into an empty directory,
  // which is what ships, and the run replaces the poisoned cache entry on
  // its way past.
  console.log('Clearing build output…');
  for (const [libDir] of LIBS) {
    rmSync(join(ROOT, libDir, 'dist'), { recursive: true, force: true });
  }

  console.log('Building libraries…');
  run('npx', ['nx', 'run-many', '-t', 'build', '--skip-nx-cache'], ROOT);

  console.log(`Packing into ${dir}`);
  for (const [libDir] of LIBS) {
    run('npm', ['pack', '--pack-destination', dir], join(ROOT, libDir));
  }
  const tarballs = readdirSync(dir).filter((f) => f.endsWith('.tgz'));
  if (tarballs.length !== LIBS.length) {
    throw new Error(
      `expected ${LIBS.length} tarball(s), found ${tarballs.length}`,
    );
  }

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'packaging-check', private: true, type: 'module' }),
  );
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      // nodenext on purpose: this is the resolution mode that catches
      // extensionless relative specifiers in emitted .d.ts files.
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        noEmit: true,
        skipLibCheck: true,
        experimentalDecorators: true,
      },
      include: ['consumer.ts'],
    }),
  );
  // Names every public export and assigns the types to annotated bindings, so
  // `tsc` fails on a symbol that stopped being exported and on one whose type
  // stopped being reachable. `void [...]` at the end keeps the values used
  // without running anything.
  writeFileSync(
    join(dir, 'consumer.ts'),
    `
import Nexus, {
  Nexus as NexusNamed,
  Token,
  Module,
  Service,
  Inject,
  Optional,
  DynamicModule,
  ContainerException,
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
  isToken,
  isProvider,
  isContainer,
  setMetadata,
  getMetadata,
} from '@nexusdi/core';
import type {
  IContainer,
  TokenType,
  ProviderType,
  ModuleProvider,
  ProviderConfig,
  ModuleConfig,
  InjectionMetadata,
} from '@nexusdi/core';

interface Logger {
  log(message: string): void;
}

const LOGGER_TOKEN = new Token<Logger>('Logger');

@Service(LOGGER_TOKEN)
class ConsoleLogger implements Logger {
  log(message: string): void {
    void message;
  }
}

@Service()
class UserService {
  constructor(@Optional(LOGGER_TOKEN) private logger?: Logger) {}

  greet(): string {
    this.logger?.log('greeting');
    return 'hello';
  }
}

@Module({ providers: [ConsoleLogger, UserService] })
class AppModule {}

const container: IContainer = new Nexus();
const alsoNexus = new NexusNamed();
container.set(LOGGER_TOKEN, ConsoleLogger);
container.set(UserService);
const userService = container.get(UserService);
const greeting: string = userService.greet();

// Referenced by type only: proves the DynamicModule export still resolves
// and still carries the shape a subclass has to implement, without pulling
// a second, unrelated feature (runtime module configuration) into this check.
abstract class ConfiguredModule extends DynamicModule<{ level: string }> {
  protected readonly configToken: Token<{ level: string }> = new Token(
    'config',
  );
}
void ConfiguredModule;

const moduleRef: typeof AppModule = AppModule;
const providerType: ProviderType = { token: LOGGER_TOKEN, useClass: ConsoleLogger };
const moduleProvider: ModuleProvider = ConsoleLogger;
const providerConfig: ProviderConfig<Logger> = { token: LOGGER_TOKEN, singleton: true };
const moduleConfig: ModuleConfig = { providers: [ConsoleLogger] };
const tokenType: TokenType<Logger> = LOGGER_TOKEN;
const injectionMetadata: InjectionMetadata[] = [];

setMetadata(ConsoleLogger, 'custom', true);
const metadataValue: unknown = getMetadata(ConsoleLogger, 'custom');

const tokenCheck: boolean = isToken(LOGGER_TOKEN);
const providerCheck: boolean = isProvider(providerType);
const containerCheck: boolean = isContainer(container);

const errors: [
  typeof ContainerException,
  typeof InvalidToken,
  typeof NoProvider,
  typeof InvalidProvider,
  typeof InvalidModule,
] = [ContainerException, InvalidToken, NoProvider, InvalidProvider, InvalidModule];

void [
  alsoNexus, greeting, moduleRef, providerType, moduleProvider, providerConfig, moduleConfig,
  tokenType, injectionMetadata, metadataValue, tokenCheck, providerCheck,
  containerCheck, errors,
];
`,
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

  console.log('Type-checking a consumer…');
  run('npx', ['tsc', '-p', 'tsconfig.json'], dir);
  console.log('  ✓ the package exposes its types under nodenext');

  // A second pass at runtime: the typecheck above resolves through the
  // exports map's `types` condition, node resolves through `import`, and the
  // two point at different files. A declaration can promise a value the
  // emitted JavaScript does not export.
  console.log('Importing at runtime…');
  writeFileSync(
    join(dir, 'runtime.mjs'),
    `
import Nexus, { Token, Service, Inject } from '@nexusdi/core';

const TOKEN = new Token('greeting');

@Service(TOKEN)
class Greeter {
  greet() { return 'hello from the packed build'; }
}

@Service()
class Consumer {
  constructor(@Inject(TOKEN) greeter) {
    this.greeter = greeter;
  }
}

const container = new Nexus();
container.set(TOKEN, Greeter);
container.set(Consumer);
const consumer = container.get(Consumer);
if (consumer.greeter.greet() !== 'hello from the packed build') {
  console.error('@nexusdi/core does not resolve an injected dependency from its published build');
  process.exit(1);
}
`,
  );
  // The consumer above uses decorators, which need to run through a
  // transpiler (Node does not execute experimentalDecorators syntax
  // natively). tsc itself is used to transpile rather than run the source
  // directly, matching how a real consumer's own build would compile it.
  writeFileSync(
    join(dir, 'runtime.tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        experimentalDecorators: true,
        outDir: 'runtime-out',
        skipLibCheck: true,
      },
      include: ['runtime.mjs'],
    }),
  );
  run(
    'npx',
    ['tsc', '-p', 'runtime.tsconfig.json', '--allowJs', '--checkJs', 'false'],
    dir,
  );
  run('node', [join(dir, 'runtime-out', 'runtime.mjs')], dir);
  console.log(
    '  ✓ the package imports cleanly as ESM and resolves DI at runtime',
  );

  // A helper tsc emits under `importHelpers` becomes an `import ... from
  // "tslib"` in the published JavaScript, which the consumer's package
  // manager has to have installed. Nothing inside the workspace can tell:
  // tslib sits in the root node_modules, so every in-repo build and test
  // resolves it whether the package declares it or not, and the import only
  // fails once it is resolved from a consumer's own install -- which is this
  // directory.
  //
  // tools/repo-checks/src/tslib-dependency.test.ts checks the setting that
  // governs the emit. This checks the emit, so it also covers a tslib import
  // written by hand and one left in the output by anything else.
  console.log('Checking tslib declarations against the packed output…');
  const tslibProblems = [];
  for (const [, name] of LIBS) {
    const pkgRoot = join(dir, 'node_modules', ...name.split('/'));
    const manifest = JSON.parse(
      readFileSync(join(pkgRoot, 'package.json'), 'utf8'),
    );
    const declared = 'tslib' in (manifest.dependencies ?? {});

    const modules = readdirSync(join(pkgRoot, 'dist'), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && /\.(?:js|cjs|mjs)$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name));

    const importers = modules.filter((file) =>
      /(?:from|import|require\s*\()\s*["']tslib(?:\/[^"']*)?["']/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    if (importers.length && !declared) {
      tslibProblems.push(
        `${name} imports tslib from ${importers.length} module(s) but declares ` +
          `no tslib dependency: a consumer install resolves nothing`,
      );
    }
    if (!importers.length && declared) {
      tslibProblems.push(
        `${name} declares tslib but no module in its published output imports ` +
          `it: every consumer installs it for nothing`,
      );
    }
  }
  if (tslibProblems.length) {
    throw new Error(tslibProblems.join('\n'));
  }
  console.log('  ✓ tslib is declared by exactly the packages that import it');

  // The package promises a `@nexusdi/source` condition published consumers
  // never enable. If it were the resolution manager reaches under any of
  // node's default conditions, source would ship as the resolved entry
  // instead of dist, and a consumer without the condition would import
  // TypeScript directly.
  const corePkg = JSON.parse(
    readFileSync(
      join(dir, 'node_modules', '@nexusdi', 'core', 'package.json'),
      'utf8',
    ),
  );
  const conditions = Object.keys(corePkg.exports['.']);
  if (conditions[0] !== '@nexusdi/source') {
    throw new Error(
      "@nexusdi/core's exports map must list the @nexusdi/source condition " +
        'first, so it is only ever chosen when a consumer explicitly enables it.',
    );
  }
  if (!conditions.includes('types') || !conditions.includes('import')) {
    throw new Error(
      "@nexusdi/core's exports map lost its types or import condition.",
    );
  }
  console.log(
    '  ✓ the tarball resolved through node without the @nexusdi/source condition',
  );

  console.log('\nPackaging verified.');
} catch (error) {
  failed = true;
  console.error('\nPackaging check FAILED\n');
  console.error(error.stdout || error.message);
  if (error.stderr) console.error(error.stderr);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
