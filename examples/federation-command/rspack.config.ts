import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { meridianShared } from '@nexusdi/federation-contracts/shared';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decoratorsParser, decoratorsTransform } from './swc.decorators';

// __dirname is undefined when @rspack/cli loads this config as ESM (it
// does, because the file uses `import` statements). Derive it from the
// module URL so the config works regardless of how the loader interprets it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 4302;
const NAME = 'federation_command';

// Read mode from the rspack CLI arg (`--mode=development|production`) so the
// config works the same on Windows + POSIX without depending on a shell
// `NODE_ENV=...` prefix.
export default defineConfig((_env, argv) => {
  const isDev = argv.mode !== 'production';
  return {
    context: __dirname,
    entry: { main: './src/index.ts' },
    output: {
      path: path.resolve(__dirname, 'dist', 'main'),
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
    optimization: {
      minimizer: [
        // @Module names the module after its class. A minifier that renames
        // or drops class names leaves the module unnamed in graph(ship) and
        // in every error, so the production build keeps them.
        new rspack.SwcJsMinimizerRspackPlugin({
          minimizerOptions: {
            compress: { keep_classnames: true },
            mangle: { keep_classnames: true },
          },
        }),
      ],
    },
    module: {
      rules: [
        {
          test: /\.(j|t)sx?$/,
          exclude: [/node_modules/],
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                // Standard decorators: Command and Bridge use @Module and
                // @Inject.
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                  ...decoratorsParser,
                },
                transform: {
                  ...decoratorsTransform,
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
        shared: meridianShared(),
        dts: false,
      }),
    ].filter(Boolean),
  };
});
