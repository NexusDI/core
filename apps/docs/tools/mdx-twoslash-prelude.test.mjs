// @vitest-environment node
import { createTwoslasher } from 'twoslash';
import { describe, expect, it } from 'vitest';

import loader, { withPrelude } from './mdx-twoslash-prelude.mjs';

const fence = '```';
const call = (source) =>
  loader.call(
    { getOptions: () => ({}), addDependency() {}, resourcePath: 'x.mdx' },
    source,
  );

// Twoslash builds a TypeScript environment on its first compile, which takes
// seconds when the run shares the machine with other projects' tests.
describe('the twoslash prelude', { timeout: 30_000 }, () => {
  it('compiles a fence that awaits a container and logs', () => {
    const code = [
      "import { Nexus, Token, defineModule, provide } from '@nexusdi/core';",
      'interface IReactor { on(): boolean }',
      "const REACTOR = new Token<IReactor>('Reactor');",
      "await using ship = await Nexus.create(defineModule({ name: 'Engineering', providers: [provide(REACTOR, { useValue: { on: () => true } })] }));",
      'console.log(ship.get(REACTOR).on());',
    ].join('\n');
    const result = createTwoslasher()(withPrelude(code), 'ts');
    expect(result.code.trim()).toBe(code);
  });

  it('prepends to a twoslash fence and leaves every other fence alone', () => {
    const source = [
      `${fence}ts twoslash`,
      'const a = 1;',
      fence,
      '',
      `${fence}ts`,
      'const b = 2;',
      fence,
    ].join('\n');
    const out = call(source);
    expect(out).toContain('// @lib: es2023,esnext.disposable');
    expect(out.match(/---cut---/g)).toHaveLength(1);
    expect(out).toContain(`${fence}ts\nconst b = 2;\n${fence}`);
  });

  it('keeps a fence that already cuts its own preamble', () => {
    const code =
      "import { Token } from '@nexusdi/core';\nconst PRE = 1;\n// ---cut---\nconst T = new Token<string>('T');\nconsole.log(T, PRE);";
    expect(
      withPrelude(code).match(/---cut---/g),
      'Twoslash honours the last cut either way, so the count is what holds ' +
        'the prelude to one cut.',
    ).toHaveLength(1);
    expect(createTwoslasher()(withPrelude(code), 'ts').code.trim()).toBe(
      "const T = new Token<string>('T');\nconsole.log(T, PRE);",
    );
  });
});
