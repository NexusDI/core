import { join } from 'node:path';

import { expect, it } from 'vitest';
import { startVitest } from 'vitest/node';

it('fails the test whose container throws on disposal', async () => {
  const root = join(import.meta.dirname, '__fixtures__', 'disposal');
  const vitest = await startVitest('test', [], {
    root,
    config: join(root, 'vitest.config.ts'),
    watch: false,
    reporters: [],
  });
  let byName: Record<string, string | undefined>;
  try {
    const results = vitest.state.getFiles().flatMap((file) => file.tasks);
    byName = Object.fromEntries(
      results.map((task) => [task.name, task.result?.state]),
    );
  } finally {
    await vitest.close();
  }
  expect(byName).toEqual({
    'passes and still fails on disposal': 'fail',
    'passes with a clean container': 'pass',
  });
}, 60_000);
