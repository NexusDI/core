import { describe, expect, it } from 'vitest';

import { gzipSync } from 'node:zlib';

import { build } from 'esbuild';

/** profile() alone, bundled and minified as an app's build would ship it. */
async function bundled(entry: string): Promise<string> {
  const result = await build({
    stdin: {
      contents: entry,
      resolveDir: new URL('../..', import.meta.url).pathname,
      loader: 'ts',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    external: ['@nexusdi/core'],
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

describe('the profile() bundle', () => {
  it('carries no live drawing code unless the app imports @nexusdi/devtools/live', async () => {
    const plain = await bundled("export { profile } from './src/index.ts';");
    // console.timeStamp is live mode's only sink, and the span colours and
    // the pending tooltip are spansOf's own strings.
    // latestDep is criticalPathOf's own field name, which minifying keeps.
    for (const mark of [
      'timeStamp',
      'primary-light',
      'still awaiting at timeout',
      'latestDep',
    ])
      expect(plain).not.toContain(mark);
    // 1,952 B at the subpath split. criticalPathOf alone adds about 700 B.
    expect(gzipSync(plain, { level: 9 }).length).toBeLessThanOrEqual(2_100);
    const live = await bundled(
      "export { profile } from './src/index.ts'; export { liveSink } from './src/live.ts';",
    );
    for (const mark of ['timeStamp', 'primary-light', 'latestDep'])
      expect(live).toContain(mark);
  });
});
