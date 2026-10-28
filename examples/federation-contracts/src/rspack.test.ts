import { describe, expect, it } from 'vitest';

import { EmitFilesPlugin, meridianRemote, meridianShell } from './rspack.js';

type Emitted = { file: string; text: string };

/** Runs `plugin` against a compiler that records each emitted asset. */
function emitted(plugin: EmitFilesPlugin): Emitted[] {
  const assets: Emitted[] = [];
  const compilation = {
    hooks: {
      processAssets: { tap: (_: unknown, run: () => void) => run() },
    },
    emitAsset: (file: string, source: { text: string }) =>
      assets.push({ file, text: source.text }),
  };
  plugin.apply({
    hooks: {
      thisCompilation: {
        tap: (_: string, run: (compilation: unknown) => void) =>
          run(compilation),
      },
    },
    rspack: {
      Compilation: { PROCESS_ASSETS_STAGE_ADDITIONAL: 0 },
      sources: {
        RawSource: class {
          constructor(readonly text: string) {}
        },
      },
    },
  } as never);
  return assets;
}

describe('meridianRemote', () => {
  const config = meridianRemote({
    name: 'federation_test',
    port: 4399,
    context: '/remote',
  })({}, { mode: 'production' });

  it('names the container and serves on the given port', () => {
    expect(config.output?.uniqueName).toBe('federation_test');
    expect(config.devServer && config.devServer.port).toBe(4399);
  });

  it('writes dist/main by default and dist/<out> when asked', () => {
    expect(config.output?.path).toBe('/remote/dist/main');
    expect(
      meridianRemote({ name: 'n', port: 1, out: 'drift', context: '/remote' })(
        {},
        { mode: 'production' },
      ).output?.path,
    ).toBe('/remote/dist/drift');
  });

  it('has no entry module and no HTML page', () => {
    expect(config.entry).toEqual({});
    expect(
      config.plugins?.some(
        (plugin) => plugin?.constructor.name === 'HtmlRspackPlugin',
      ),
    ).toBe(false);
  });

  it('compiles standard decorators only when asked', () => {
    const rule = (decorators: boolean) =>
      JSON.stringify(
        meridianRemote({ name: 'n', port: 1, decorators })(
          {},
          { mode: 'production' },
        ).module?.rules,
      );

    expect(rule(true)).toContain('"decoratorVersion":"2023-11"');
    expect(rule(false)).not.toContain('decoratorVersion');
  });
});

describe('meridianShell', () => {
  it('builds dist/e2e under --env devtools and dist/main otherwise', () => {
    const shell = meridianShell({ name: 's', port: 1, context: '/shell' });

    expect(shell({}, { mode: 'production' }).output?.path).toBe(
      '/shell/dist/main',
    );
    expect(shell({ devtools: true }, { mode: 'production' }).output?.path).toBe(
      '/shell/dist/e2e',
    );
  });

  it('emits the files it is given', () => {
    const config = meridianShell({
      name: 's',
      port: 1,
      files: { 'remotes.json': '[]' },
    })({}, { mode: 'production' });
    const plugin = config.plugins?.find(
      (item): item is EmitFilesPlugin => item instanceof EmitFilesPlugin,
    );

    expect(plugin && emitted(plugin)).toEqual([
      { file: 'remotes.json', text: '[]' },
    ]);
  });
});
