import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { meridianShared } from '@nexusdi/federation-contracts/shared';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname is undefined when @rspack/cli loads this config as ESM (it
// does, because the file uses `import` statements). Derive it from the
// module URL so the config works regardless of how the loader interprets it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 4300;
const NAME = 'federation_shell';

// Read mode from the rspack CLI arg (`--mode=development|production`) so the
// config works the same on Windows + POSIX without depending on a shell
// `NODE_ENV=...` prefix. `--env devtools` makes the e2e build: production
// code with devtools() registered, in dist/e2e.
export default defineConfig((env, argv) => {
  const isDev = argv.mode !== 'production';
  const e2e = env['devtools'] === true;
  return {
    context: __dirname,
    entry: { main: './src/index.ts' },
    output: {
      path: path.resolve(__dirname, 'dist', e2e ? 'e2e' : 'main'),
      // The routes live at /charts and /command, so the page loads its
      // chunks from the root.
      publicPath: '/',
      uniqueName: NAME,
      clean: true,
    },
    devServer: {
      port: PORT,
      historyApiFallback: true,
      hot: true,
      static: path.resolve(__dirname, 'public'),
    },
    resolve: { extensions: ['...', '.ts', '.tsx', '.jsx'] },
    module: {
      rules: [
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
      new rspack.HtmlRspackPlugin({ template: './index.html' }),
      // public/remotes.json, the development remote list.
      new rspack.CopyRspackPlugin({ patterns: [{ from: 'public' }] }),
      new rspack.DefinePlugin({ MERIDIAN_DEVTOOLS: isDev || e2e }),
      new ModuleFederationPlugin({
        name: NAME,
        // No build-time `remotes:` block. src/mf.ts registers the list
        // /remotes.json names before the first loadRemote().
        shared: meridianShared(),
        dts: false,
      }),
    ].filter(Boolean),
  };
});
