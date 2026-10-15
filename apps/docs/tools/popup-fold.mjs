/**
 * Every Twoslash hover on a page's fences, folded out of the page into one
 * table of panels for the page.
 *
 * A popup is a hover's type, highlighted token by token, and its docblock:
 * twenty-odd elements written into every token that carries a hover, and a
 * reference page carries thousands. `/api/` held 4 MB of them twice, once in
 * the DOM and once in the RSC payload, in 24,000 of its 39,000 nodes, with far
 * fewer distinct types than tokens. So this does what `behaviour-data.mjs`'s
 * `fold` does for a behaviour case: each panel leaves the tree, its HTML goes
 * once into the page's table under a key, and the token keeps a real
 * `<button>` carrying `data-pop="<key>"`. `mdx-nextra-loader.mjs` writes the
 * table to `public/popups/<page>.json`, and `components/twoslash/PagePopover.tsx`
 * fetches it and shows one card while a token is open.
 *
 * It runs in Shiki's `root` hook, which runs after every transformer's `code`
 * hook, and Twoslash builds the popups in its `code` hook. Nextra's renderer
 * writes a hover as `Popup` around a `PopupPanel` and a `PopupButton`
 * (`nextra/dist/server/twoslash.js`); the hover becomes a plain
 * `span.twoslash-hover`, so `rehypeTwoslashPopup` finds no popup to map and
 * no component renders per token.
 *
 * The panel is sanitized before it becomes a string. A hover's docblock comes
 * from whatever declaration the token resolves to, a third-party `.d.ts`
 * included, and a Markdown link in it becomes an `<a href>` whatever its
 * protocol. `hast-util-sanitize`'s GitHub schema keeps what a rendered README
 * may carry, `javascript:` links out, plus the classes and inline styles Shiki
 * writes. `panelHtml` and its schema are ported from `Evanion/libraries`
 * `apps/docs/tools/popup-panels.mjs` at 670ac27f.
 */
import { defaultSchema, sanitize } from 'hast-util-sanitize';
import { hastToHtml } from 'shiki';

/**
 * The GitHub schema with any class allowed on any element, and inline styles
 * on the two elements Shiki writes them on.
 */
const SCHEMA = (() => {
  const isClassName = (entry) =>
    (Array.isArray(entry) ? entry[0] : entry) === 'className';
  const attributes = Object.fromEntries(
    Object.entries(defaultSchema.attributes ?? {}).map(([tag, allowed]) => [
      tag,
      allowed.filter((entry) => !isClassName(entry)),
    ]),
  );
  attributes['*'] = [...(attributes['*'] ?? []), 'className'];
  attributes.span = [...(attributes.span ?? []), 'style'];
  attributes.pre = [...(attributes.pre ?? []), 'style'];
  return { ...defaultSchema, attributes };
})();

const named = (node, name) =>
  node?.type === 'element' && node.tagName.toLowerCase() === name;

/**
 * A tree with every `class` property moved to `className`, the name hast
 * defines. Shiki and its Twoslash renderer write `class`, which
 * `hast-util-sanitize` drops as unknown.
 */
function withClassNames(node) {
  if (node.type !== 'element') return node;
  const { class: held, ...properties } = node.properties ?? {};
  if (held !== undefined)
    properties.className = [
      ...(properties.className ?? []),
      ...String(held).split(/\s+/).filter(Boolean),
    ];
  return {
    ...node,
    properties,
    children: (node.children ?? []).map(withClassNames),
  };
}

/**
 * What `rehype-pretty-code` and Nextra do to every highlighted line, done to
 * the lines of a code block inside a popup, which leaves the tree before they
 * run: the leading `line` class comes off, and an empty line gets a space so
 * it keeps its height.
 */
function asVisitedLines(node) {
  if (node.type !== 'element') return node;
  const children = (node.children ?? []).map(asVisitedLines);
  const [first, ...rest] = node.properties.className ?? [];
  if (first !== 'line') return { ...node, children };
  return {
    ...node,
    properties: {
      ...node.properties,
      className: rest.length ? rest : undefined,
    },
    children: children.length ? children : [{ type: 'text', value: ' ' }],
  };
}

/** A panel's contents, sanitized, as one HTML string. */
export function panelHtml(children) {
  return hastToHtml(
    sanitize(
      {
        type: 'root',
        children: children.map(withClassNames).map(asVisitedLines),
      },
      SCHEMA,
    ),
  );
}

/** FNV-1a over a panel's HTML, as a short key two equal panels share. */
export function keyOf(html) {
  let hash = 0x811c9dc5;
  for (let at = 0; at < html.length; at += 1) {
    hash ^= html.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Replaces every hover under `node` with its folded form, adding each panel to
 * `panels`, and returns how many tokens it folded.
 */
function fold(node, panels, state) {
  for (const [at, child] of (node.children ?? []).entries()) {
    if (!named(child, 'popup')) {
      fold(child, panels, state);
      continue;
    }

    const panel = child.children.find((each) => named(each, 'popuppanel'));
    const button = child.children.find((each) => named(each, 'popupbutton'));
    if (!panel || !button) {
      fold(child, panels, state);
      continue;
    }

    const html = panelHtml(panel.children);
    const key = keyOf(html);
    panels.set(key, html);

    node.children[at] = {
      type: 'element',
      tagName: 'span',
      properties: withClassNames(child).properties,
      children: [
        {
          type: 'element',
          tagName: 'button',
          properties: {
            type: 'button',
            className: ['nexus-popup__button'],
            dataPop: key,
            // One tab stop per fence: the first token holds it, and the arrow
            // keys move it (`PagePopover.tsx`).
            tabIndex: state.first ? 0 : -1,
          },
          children: button.children,
        },
      ],
    };
    state.first = false;
  }
}

/**
 * Every panel this worker has folded, by key. A highlighted fence can come
 * from a cache without the transformer running again, so a page's table is
 * read from the keys its compiled output carries (`tableOf`), and the panels
 * from here.
 */
const registry = new Map();

/** The Shiki transformer that folds every hover of a block into `registry`. */
export function popupFold() {
  return {
    name: '@nexusdi/docs:popup-fold',
    root(tree) {
      fold(tree, registry, { first: true });
    },
  };
}

/**
 * A page's table: every key its compiled source carries, with its panel.
 * Throws for a key no fold in this worker registered, which would leave a
 * token with no type.
 */
export function tableOf(compiled) {
  const keys = [
    ...new Set(
      [...compiled.matchAll(/data-pop="([a-z0-9]+)"/g)].map(([, key]) => key),
    ),
  ].sort();
  return new Map(
    keys.map((key) => {
      const html = registry.get(key);
      if (html === undefined)
        throw new Error(`popup-fold: no panel for key ${key}`);
      return [key, html];
    }),
  );
}
