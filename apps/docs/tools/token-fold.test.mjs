// @vitest-environment node
import { createTransformerFactory, rendererRich } from '@shikijs/twoslash';
import { codeToHast } from 'shiki';
import { describe, expect, it } from 'vitest';

import { codeClasses, foreground, THEMES } from './code-classes.mjs';
import { popupFold } from './popup-fold.mjs';
import { highlights, tokenFold } from './token-fold.mjs';

const CODE = [
  "import { Nexus, Token, defineModule } from '@nexusdi/core';",
  '',
  'interface IHullSensors {',
  '  readonly range: number;',
  '}',
  "const SENSORS = new Token<IHullSensors>('HullSensors');",
  'export declare class Probe {',
  '    static deps = [SENSORS] as const;',
  '}',
].join('\n');

/** A hover on `Token` in the sixth line, as Twoslash reports one. */
const HOVER = {
  type: 'hover',
  text: 'class Token<T>',
  start: CODE.indexOf('Token<'),
  length: 'Token'.length,
  line: 5,
  character: CODE.split('\n')[5].indexOf('Token'),
};

/**
 * Twoslash's rich renderer with the tags Nextra's renderer gives a hover
 * (`nextra/dist/server/twoslash.js`), which `popup-fold.mjs` folds.
 */
const renderer = rendererRich({
  jsdoc: false,
  hast: {
    hoverToken: { tagName: 'Popup' },
    hoverPopup: { tagName: 'PopupPanel' },
    hoverCompose: ({ popup, token }) => [
      popup,
      {
        type: 'element',
        tagName: 'PopupButton',
        properties: {},
        children: [token],
      },
    ],
  },
});

/**
 * A fence the way the site highlights one: both themes, no default colour,
 * Twoslash, and the site's transformers in the loader's order, with or
 * without the token fold.
 */
function highlight(code, { fold = true, nodes = [HOVER], meta = '' } = {}) {
  const twoslash = createTransformerFactory(
    () => ({ code, nodes, meta: {} }),
    renderer,
  )({ langs: ['ts'] });
  return codeToHast(code, {
    lang: 'ts',
    themes: THEMES,
    defaultColor: false,
    meta: { __raw: meta },
    transformers: [
      twoslash,
      codeClasses(),
      popupFold(),
      ...(fold ? [tokenFold()] : []),
    ],
  });
}

const isElement = (node) => node.type === 'element';

function classesOf(node) {
  const held = node.properties?.class ?? node.properties?.className ?? [];
  return Array.isArray(held) ? held : String(held).split(/\s+/);
}

const codeOf = (tree) =>
  tree.children[0].children.find((child) => child.tagName === 'code');

const linesOf = (tree) =>
  codeOf(tree).children.filter(
    (child) => isElement(child) && classesOf(child).includes('line'),
  );

const textOf = (node) =>
  node.type === 'text'
    ? node.value
    : (node.children ?? []).map(textOf).join('');

/**
 * Each character of the code with the token class whose colour it takes: its
 * nearest ancestor with one, the `<code>` included, since the theme
 * variables inherit.
 */
function colours(tree) {
  const out = [];
  const walk = (node, colour) => {
    if (node.type === 'text') {
      for (const char of node.value) out.push([char, colour]);
      return;
    }
    const own = classesOf(node).find((name) => name.startsWith('sh-'));
    for (const child of node.children ?? []) walk(child, own ?? colour);
  };
  walk(codeOf(tree), null);
  return out;
}

/** Every token span under the `<code>`: a span with a token class. */
function tokens(tree) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (!isElement(child)) continue;
      if (classesOf(child).some((name) => name.startsWith('sh-')))
        out.push(child);
      walk(child);
    }
  };
  walk(codeOf(tree));
  return out;
}

describe('the token fold', () => {
  it('colours every character as the unfolded fence does', async () => {
    const before = colours(await highlight(CODE, { fold: false }));
    const after = colours(await highlight(CODE));

    expect(after.map(([char]) => char)).toEqual(before.map(([char]) => char));
    // A character in the default foreground takes it from the `<code>` once
    // its token is gone. White space shows no colour.
    const shown = (list) =>
      list.map(([char, colour]) => (char.trim() === '' ? null : colour));
    expect(shown(after)).toEqual(shown(before));
  });

  it('keeps every line and its text', async () => {
    const before = linesOf(await highlight(CODE, { fold: false }));
    const after = linesOf(await highlight(CODE));

    expect(after.map(textOf)).toEqual(before.map(textOf));
  });

  it('drops the foreground and white-space tokens and merges neighbours of one class', async () => {
    const tree = await highlight(CODE);
    const spans = tokens(tree);

    expect(classesOf(codeOf(tree))).toContain(foreground);
    expect(
      spans.filter((span) => classesOf(span).includes(foreground)),
    ).toEqual([]);
    expect(
      spans.filter(
        (span) =>
          span.children.every((child) => child.type === 'text') &&
          textOf(span).trim() === '',
      ),
    ).toEqual([]);
    for (const line of linesOf(tree))
      for (const [at, child] of line.children.entries()) {
        const next = line.children[at + 1];
        if (!next || !isElement(child) || !isElement(next)) continue;
        if (child.children.some(isElement) || next.children.some(isElement))
          continue;
        expect(classesOf(next)).not.toEqual(classesOf(child));
      }
    expect(spans.length).toBeLessThan(
      tokens(await highlight(CODE, { fold: false })).length * 0.6,
    );
  });

  it("keeps a hover's token and its button", async () => {
    const tree = await highlight(CODE);
    const button = tokens(tree)
      .flatMap((span) => span.children)
      .flatMap((child) => child.children ?? [])
      .find((node) => node.tagName === 'button');

    expect(button?.properties.dataPop).toBeTruthy();
    expect(textOf(button)).toBe('Token');
  });

  it('leaves a fence whose lines hold more than tokens as Shiki wrote it', async () => {
    const highlighted = {
      type: 'highlight',
      start: CODE.indexOf('readonly'),
      length: 'readonly range'.length,
      line: 3,
      character: 2,
    };
    const folded = await highlight(CODE, { nodes: [highlighted] });
    const plain = await highlight(CODE, { fold: false, nodes: [highlighted] });

    expect(JSON.stringify(plain)).toContain('twoslash-highlighted');
    expect(folded).toEqual(plain);
  });

  it('leaves a fence that highlights lines or characters as Shiki wrote it', async () => {
    for (const meta of ['{2,4}', '/range/', 'filename="probe.ts" {1}']) {
      expect(highlights(meta)).toBe(true);
      expect(await highlight(CODE, { meta })).toEqual(
        await highlight(CODE, { fold: false, meta }),
      );
    }
    expect(highlights('filename="probe.ts"')).toBe(false);
    expect(highlights('twoslash')).toBe(false);
  });
});
