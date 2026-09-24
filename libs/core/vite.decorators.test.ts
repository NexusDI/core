import type { TransformResult } from 'vite';
import { describe, expect, it } from 'vitest';

import { thrown } from './test-support/catch.js';
import { standardDecorators } from './vite.decorators.ts';

/** Runs the plugin's transform hook the way Vite calls it. */
function transform(code: string, id: string): string | null {
  const hook = standardDecorators().transform;
  if (typeof hook !== 'function') throw new Error('transform is not a hook');
  const result = hook.call({} as never, code, id) as TransformResult | null;
  return result === null ? null : result.code;
}

/** The body of the first doctest fence in `markdown`. */
function firstBlock(markdown: string): string {
  const match = markdown.match(/```ts @import\.meta\.vitest\n([\s\S]*?)\n```/);
  if (!match) throw new Error('no doctest block');
  return match[1] as string;
}

const AsyncFunction = (async () => undefined).constructor as new (
  body: string,
) => () => Promise<unknown>;

const README = [
  '# Probe', // 1
  '', // 2
  '```ts @import.meta.vitest', // 3
  'const seen = [];', // 4
  'function tag(value, context) {', // 5
  '  seen.push(context.name);', // 6
  '}', // 7
  '@tag', // 8
  'class Probe {', // 9
  '  @tag accessor text: string = `one', // 10
  'two`;', // 11
  '}', // 12
  'new Probe().text; // -> "one\\ntwo"', // 13
  'return { seen, text: new Probe().text };', // 14
  '```', // 15
  '', // 16
  '```ts', // 17
  '@tag', // 18
  'class Untouched {}', // 19
  '```', // 20
].join('\n');

describe('standardDecorators', () => {
  it('keeps every line of a markdown file at its line number', () => {
    const lowered = transform(README, '/docs/README.md') as string;
    const before = README.split('\n');
    const after = lowered.split('\n');

    expect(after).toHaveLength(before.length);
    for (const line of [1, 2, 3, 4, 5, 6, 7, 13, 14, 15, 16, 17, 18, 19, 20]) {
      expect(after[line - 1]).toBe(before[line - 1]);
    }
    expect(after.slice(7, 12).join('\n')).not.toContain('@tag');
  });

  it('lowers a decorated statement in a doctest block to code that runs', async () => {
    const lowered = transform(README, '/docs/README.md') as string;

    await expect(new AsyncFunction(firstBlock(lowered))()).resolves.toEqual({
      seen: ['text', 'Probe'],
      text: 'one\ntwo',
    });
  });

  it('returns null for markdown with no decorated doctest block', () => {
    const plain = README.replace('```ts @import.meta.vitest', '```ts');

    expect(transform(plain, '/docs/README.md')).toBeNull();
  });

  it('throws, naming the block, for a value claim inside a decorated statement', () => {
    const claimed = README.replace('class Probe {', 'class Probe { // -> 1');

    expect(thrown(() => transform(claimed, '/docs/README.md'))).toMatchObject({
      message: expect.stringContaining('/docs/README.md:3'),
    });
  });
});
