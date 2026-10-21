import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import {
  meridianShared,
  type SharedSingleton,
} from '@nexusdi/federation-contracts/shared';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname is undefined when @rspack/cli loads this config as ESM (it
// does, because the file uses `import` statements). Derive it from the
// module URL so the config works regardless of how the loader interprets it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 4301;
const NAME = 'federation_cartography';

/**
 * What tells the builds of this remote apart: the dist folder and the
 * `shared` object. The drift build also sets aliases for the contracts
 * package's imports.
 */
export interface CartographyBuild {
  readonly out: 'main' | 'drift' | 'unshared';
  readonly shared: Record<string, SharedSingleton>;
  readonly contractAliases?: Record<string, string>;
}

export const mainBuild: CartographyBuild = {
  out: 'main',
  shared: meridianShared(),
};

/** The rspack config of one build of the cartography remote. */
export const cartography = (build: CartographyBuild) =>
  // Read mode from the rspack CLI arg (`--mode=development|production`) so
  // the config works the same on Windows + POSIX without depending on a
  // shell `NODE_ENV=...` prefix.
  defineConfig((_env, argv) => {
    const isDev = argv.mode !== 'production';
    return {
      context: __dirname,
      entry: { main: './src/index.ts' },
      output: {
        path: path.resolve(__dirname, 'dist', build.out),
        publicPath: 'auto',
        uniqueName: NAME,
        clean: true,
      },
      devServer: {
        port: PORT,
        historyApiFallback: true,
        hot: true,
        headers: { 'Access-Control-Allow-Origin': '*' },
      },
      resolve: { extensions: ['...', '.ts', '.tsx', '.jsx'] },
      module: {
        rules: [
          ...(build.contractAliases === undefined
            ? []
            : [
                {
                  // Only the contracts package's own imports take the alias,
                  // so drift/version.ts still reads the real version.
                  test: /federation-contracts[\\/]dist[\\/]/,
                  resolve: { alias: build.contractAliases },
                },
              ]),
          {
            test: /\.(j|t)sx?$/,
            exclude: [/node_modules/],
            use: {
              loader: 'builtin:swc-loader',
              options: {
                jsc: {
                  parser: { syntax: 'typescript', tsx: true },
                  transform: {
                    react: {
                      runtime: 'automatic',
                      development: isDev,
                      refresh: isDev,
                    },
                  },
                },
                env: {
                  targets:
                    'Chrome >= 87, Firefox >= 78, Edge >= 88, Safari >= 14',
                },
              },
            },
          },
        ],
      },
      plugins: [
        isDev && new ReactRefreshRspackPlugin(),
        // excludeChunks is REQUIRED on a provider: without it the federation
        // remoteEntry chunk gets injected into the standalone HTML and breaks
        // direct serves.
        new rspack.HtmlRspackPlugin({
          template: './index.html',
          excludeChunks: [NAME],
        }),
        new ModuleFederationPlugin({
          name: NAME,
          filename: 'remoteEntry.js',
          exposes: { './section': './src/section.ts' },
          shared: build.shared,
          dts: false,
        }),
      ].filter(Boolean),
    };
  });

export default cartography(mainBuild);
