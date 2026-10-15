// @vitest-environment node
import { createTransformerFactory, rendererRich } from '@shikijs/twoslash';
import { codeToHast } from 'shiki';
import { describe, expect, it } from 'vitest';

import { codeClasses, stylesheet, THEMES } from './code-classes.mjs';

/** Every element under `node`, depth first. */
function* elements(node) {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue;
    yield child;
    yield* elements(child);
  }
}

function classesOf(node) {
  const held = node.properties.class ?? node.properties.className ?? [];
  return Array.isArray(held) ? held : String(held).split(/\s+/);
}

/**
 * A fence the way the site highlights one: both themes, no default colour, and
 * Twoslash's rich renderer putting a popup on a token, whose type Twoslash
 * highlights again on its own.
 */
async function highlight(code, lang, nodes = []) {
  const twoslash = createTransformerFactory(
    () => ({ code, nodes, meta: {} }),
    rendererRich({ jsdoc: false }),
  )({ langs: ['ts'] });
  return codeToHast(code, {
    lang,
    themes: THEMES,
    defaultColor: false,
    transformers: [twoslash, codeClasses()],
  });
}

const CODE = [
  "import { createTestingContainer } from '@nexusdi/testing';",
  '// the override replaces the provider',
  'const builder = createTestingContainer(root);',
  'export function twice<T>(value: T): [T, T] {',
  '  return [value, value];',
  '}',
].join('\n');

const HOVER = {
  type: 'hover',
  text: 'function createTestingContainer(root: ModuleDefinition): TestingContainerBuilder',
  start: CODE.indexOf('createTestingContainer(r'),
  length: 'createTestingContainer'.length,
  line: 2,
  character: CODE.split('\n')[2].indexOf('createTestingContainer'),
};

describe('the token classes', () => {
  it('leave no theme colours in a style under the block, popups included', async () => {
    const tree = await highlight(CODE, 'ts', [HOVER]);
    const [pre] = tree.children;
    const under = [...elements(pre)];

    expect(
      under.some((node) =>
        classesOf(node).includes('twoslash-popup-container'),
      ),
    ).toBe(true);
    expect(
      under.filter((node) =>
        String(node.properties.style ?? '').includes('--shiki-'),
      ),
    ).toEqual([]);
  });

  it('use only classes the stylesheet defines', async () => {
    const tree = await highlight(CODE, 'ts', [HOVER]);
    const used = new Set(
      [...elements(tree)]
        .flatMap(classesOf)
        .filter((name) => name.startsWith('sh-')),
    );

    expect(used.size).toBeGreaterThan(3);
    for (const name of used) expect(stylesheet).toContain(`.${name}{`);
  });

  it("leave the block's own <pre> its style, since behaviour-data drops the <pre>", async () => {
    const tree = await highlight(CODE, 'ts');
    const [pre] = tree.children;

    expect(pre.properties.style).toContain('--shiki-light-bg');
    expect(classesOf(pre).some((name) => name.startsWith('sh-'))).toBe(false);
  });

  it('keep a style the stylesheet does not hold inline', async () => {
    const tree = await highlight('_slanted_ and **heavy**', 'md');
    const styled = [...elements(tree.children[0])].filter(
      (node) => node.properties.style,
    );

    expect(styled.length).toBeGreaterThan(0);
    for (const node of styled)
      expect(node.properties.style).toMatch(/font-style|font-weight/);
  });
});
