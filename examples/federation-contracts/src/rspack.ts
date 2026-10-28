import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { rspack, type Compiler, type RspackOptions } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import * as path from 'node:path';

import { meridianShared, type SharedSingleton } from './shared.js';
import { decoratorsParser, decoratorsTransform } from './swc.js';

/** What rspack passes a config function: the `--env` flags and the CLI mode. */
type ConfigFactory = (
  env: Record<string, unknown>,
  argv: { readonly mode?: string },
) => RspackOptions;

/** The browsers every Meridian bundle supports. */
const TARGETS = 'Chrome >= 87, Firefox >= 78, Edge >= 88, Safari >= 14';

/**
 * The rule that compiles the sources with swc. In development it adds React
 * refresh. `decorators` turns on standard decorators, for a bundle whose
 * classes use `@Module` and `@Inject`.
 */
function swcRule(isDev: boolean, decorators: boolean) {
  return {
    test: /\.(j|t)sx?$/,
    exclude: [/node_modules/],
    use: {
      loader: 'builtin:swc-loader',
      options: {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: true,
            ...(decorators ? decoratorsParser : {}),
          },
          transform: {
            ...(decorators ? decoratorsTransform : {}),
            react: {
              runtime: 'automatic',
              development: isDev,
              refresh: isDev,
            },
          },
        },
        env: { targets: TARGETS },
      },
    },
  };
}

/** What one build of a station remote sets. */
export interface RemoteOptions {
  /** The federation container name, such as `federation_command`. */
  readonly name: string;
  /** The development server's port. */
  readonly port: number;
  /** Whether the remote's classes use standard decorators. */
  readonly decorators?: boolean;
  /** The folder under `dist/` the build writes to. Defaults to `main`. */
  readonly out?: string;
  /** The `shared` object. Defaults to `meridianShared()`. */
  readonly shared?: Record<string, SharedSingleton>;
  /**
   * Aliases that only the contracts package's own imports take. The drift
   * build of federation-cartography maps the contract version this way.
   */
  readonly contractAliases?: Record<string, string>;
  /** The remote's folder. Defaults to the folder rspack runs in. */
  readonly context?: string;
}

/**
 * The rspack config of a station remote. It emits `remoteEntry.js` and the
 * chunks of `./section`, with no entry module and no HTML page, because the
 * shell is the only page that loads a remote.
 */
export function meridianRemote(options: RemoteOptions): ConfigFactory {
  const {
    name,
    port,
    decorators = false,
    out = 'main',
    shared = meridianShared(),
    contractAliases,
    context = process.cwd(),
  } = options;
  return (_env, argv) => {
    const isDev = argv.mode !== 'production';
    return {
      context,
      entry: {},
      output: {
        path: path.resolve(context, 'dist', out),
        publicPath: 'auto',
        uniqueName: name,
        clean: true,
      },
      devServer: {
        port,
        hot: true,
        headers: { 'Access-Control-Allow-Origin': '*' },
      },
      resolve: { extensions: ['...', '.ts', '.tsx', '.jsx'] },
      module: {
        rules: [
          ...(contractAliases === undefined
            ? []
            : [
                {
                  // Only the contracts package's own imports take the alias,
                  // so drift/version.ts still reads the real version.
                  test: /federation-contracts[\\/]dist[\\/]/,
                  resolve: { alias: contractAliases },
                },
              ]),
          swcRule(isDev, decorators),
        ],
      },
      plugins: [
        isDev && new ReactRefreshRspackPlugin(),
        new ModuleFederationPlugin({
          name,
          filename: 'remoteEntry.js',
          exposes: { './section': './src/section.ts' },
          shared,
          dts: false,
        }),
      ].filter(Boolean),
    };
  };
}

/** What the shell's build sets. */
export interface ShellOptions {
  /** The federation container name. */
  readonly name: string;
  /** The development server's port. */
  readonly port: number;
  /** The shell's folder. Defaults to the folder rspack runs in. */
  readonly context?: string;
  /**
   * Files the build emits next to the page, by output path. The dev server
   * serves them too.
   */
  readonly files?: Record<string, string>;
}

/** A plugin that emits `files` as assets of the build. */
export class EmitFilesPlugin {
  constructor(readonly files: Readonly<Record<string, string>>) {}

  apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap('EmitFilesPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'EmitFilesPlugin',
          stage: compiler.rspack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          for (const [file, text] of Object.entries(this.files))
            compilation.emitAsset(
              file,
              new compiler.rspack.sources.RawSource(text),
            );
        },
      );
    });
  }
}

/**
 * The rspack config of the shell: the page, the `public/` files, the emitted
 * `files` and a federation host with no build-time remotes. `--env devtools`
 * builds production code with devtools registered, into `dist/e2e`.
 */
export function meridianShell(options: ShellOptions): ConfigFactory {
  const { name, port, context = process.cwd(), files = {} } = options;
  return (env, argv) => {
    const isDev = argv.mode !== 'production';
    const e2e = env['devtools'] === true;
    return {
      context,
      entry: { main: './src/index.ts' },
      output: {
        path: path.resolve(context, 'dist', e2e ? 'e2e' : 'main'),
        // The routes live at paths such as /charts, so the page loads its
        // chunks from the root.
        publicPath: '/',
        uniqueName: name,
        clean: true,
      },
      devServer: {
        port,
        historyApiFallback: true,
        hot: true,
        static: path.resolve(context, 'public'),
      },
      resolve: { extensions: ['...', '.ts', '.tsx', '.jsx'] },
      module: { rules: [swcRule(isDev, false)] },
      plugins: [
        isDev && new ReactRefreshRspackPlugin(),
        new rspack.HtmlRspackPlugin({ template: './index.html' }),
        // public/bridge.json, bridge-api's address.
        new rspack.CopyRspackPlugin({ patterns: [{ from: 'public' }] }),
        new EmitFilesPlugin(files),
        new rspack.DefinePlugin({ MERIDIAN_DEVTOOLS: isDev || e2e }),
        new ModuleFederationPlugin({
          name,
          // No build-time `remotes:` block. The shell registers the list
          // /remotes.json names before the first loadRemote().
          shared: meridianShared(),
          dts: false,
        }),
      ].filter(Boolean),
    };
  };
}
