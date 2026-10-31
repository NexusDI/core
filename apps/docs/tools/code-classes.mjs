/**
 * The classes every highlighted token carries in place of an inline `style`,
 * in a behaviour case and in a page fence, and the stylesheet that defines
 * them.
 *
 * Shiki writes both themes' colours into every token as
 * `style="--shiki-light:…;--shiki-dark:…"`. A package's cases carry tens of
 * thousands of tokens, most of them inside hover popups, and the github themes
 * colour code with about a dozen pairs. A class per pair carries the same two
 * variables, so `behaviour.css` picks one by theme exactly as it does for an
 * inline style, and each token carries a class name of about ten characters
 * in place of a style of about forty.
 *
 * Ported from `Evanion/libraries` `apps/docs/tools/code-classes.mjs` at
 * 92320250. `behaviour-data.mjs` runs the transformer over the behaviour
 * cases, and `mdx-nextra-loader.mjs` over the page fences Nextra highlights.
 *
 * The class names are `transformerStyleToClass`'s own: it names a style by a
 * hash of the style string, so the name of a pair depends on the pair alone.
 * The stylesheet holds every pair the two themes can produce, so it is
 * complete before any case is highlighted. A style outside it (a token with a
 * font style, which the github themes give only to markup scopes) keeps its
 * inline `style` and renders as before.
 */
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import { transformerStyleToClass } from '@shikijs/transformers';
import { flatTokenVariants, normalizeTheme, stringifyTokenStyle } from 'shiki';

/**
 * Nextra's own themes (`nextra/dist/server/rehype-plugins/rehype.js`), so a
 * case and a page fence share their colours.
 */
export const THEMES = { light: 'github-light', dark: 'github-dark' };

const PREFIX = '--shiki-';

const order = Object.keys(THEMES);

const themes = [githubLight, githubDark].map((theme) => normalizeTheme(theme));

for (const [at, key] of order.entries())
  if (themes[at].name !== THEMES[key])
    throw new Error(
      `code-classes imports ${themes[at].name} as ${THEMES[key]}`,
    );

/**
 * Every foreground a theme gives a token. `vscode-textmate`'s colour map
 * upper-cases each colour it registers, so a token's colour is upper case
 * whatever case the theme file spells it in.
 */
function foregrounds(theme) {
  return [
    ...new Set(
      [theme.fg, ...theme.settings.map((rule) => rule.settings?.foreground)]
        .filter(Boolean)
        .map((color) => color.toUpperCase()),
    ),
  ];
}

/** The style string Shiki writes on a token coloured `light` and `dark`. */
function pairStyle(light, dark) {
  return stringifyTokenStyle(
    flatTokenVariants(
      {
        content: '',
        offset: 0,
        variants: { [order[0]]: { color: light }, [order[1]]: { color: dark } },
      },
      order,
      PREFIX,
      false,
    ).htmlStyle,
  );
}

/**
 * Every style string Shiki writes for these themes with `defaultColor: false`:
 * one per pair of foregrounds, built by Shiki's own `flatTokenVariants`, and
 * the style it puts on a block's root, which also carries both backgrounds
 * (`codeToTokens` in `@shikijs/core`). A hover popup is a block of its own,
 * so every popup carries the root style.
 */
function styles() {
  const [light, dark] = themes.map(foregrounds);
  const pairs = light.flatMap((l) => dark.map((d) => pairStyle(l, d)));
  const root = [
    ...order.map((key, at) => `${PREFIX}${key}:${themes[at].fg}`),
    ...order.map((key, at) => `${PREFIX}${key}-bg:${themes[at].bg}`),
  ].join(';');
  return [...pairs, root];
}

/**
 * `sh-` in place of the default `__shiki_`, because the sidecar writes the
 * name once per token.
 */
const registry = transformerStyleToClass({ classPrefix: 'sh-' });

/** Each style string the stylesheet holds, and the class that stands for it. */
const classes = new Map(
  styles().map((style) => {
    const element = { type: 'element', properties: { style } };
    registry.pre.call(
      {
        addClassToHast: (node, name) => {
          node.properties.class = name;
        },
      },
      element,
    );
    return [style, element.properties.class];
  }),
);

/**
 * The class of a token in each theme's default foreground: plain text,
 * punctuation and operators. `token-fold.mjs` sets it once on a page fence's
 * `<code>` and drops it from the tokens.
 */
export const foreground = classes.get(
  pairStyle(...themes.map((theme) => theme.fg.toUpperCase())),
);

if (!foreground)
  throw new Error('code-classes holds no class for the default foreground');

/** The rules for every class in `classes`, as one stylesheet. */
export const stylesheet = `${registry.getCSS()}\n`;

/** The classes an element carries, however the producer wrote them. */
export function classesOf(node) {
  const held = node.properties?.class ?? node.properties?.className ?? [];
  return Array.isArray(held) ? held : String(held).split(/\s+/);
}

function swap(node) {
  if (node.type !== 'element') return;
  const style = node.properties.style;
  const name = typeof style === 'string' ? classes.get(style) : undefined;
  if (name) {
    delete node.properties.style;
    const held = classesOf(node).filter(Boolean);
    delete node.properties.className;
    node.properties.class = [...held, name].join(' ');
  }
  for (const child of node.children ?? []) swap(child);
}

/**
 * A Shiki transformer that moves every style the stylesheet holds into its
 * class, everywhere under the block's own `<pre>`.
 *
 * It works on the finished tree in `root` and not on tokens: Twoslash builds
 * each hover popup in its `code` hook by highlighting the type separately with
 * no transformers (`highlightPopupContent` in `@shikijs/twoslash`), so the
 * popups' tokens exist, already styled, only once every `code` hook has run.
 * The `<pre>` keeps its style, and `behaviour-data.mjs` drops the `<pre>`.
 */
export function codeClasses() {
  return {
    name: '@nexusdi/docs:code-classes',
    root(tree) {
      for (const block of tree.children)
        for (const child of block.children ?? []) swap(child);
    },
  };
}
