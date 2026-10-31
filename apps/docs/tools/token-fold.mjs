/**
 * A page fence's tokens, written with the fewest spans that colour the code
 * the same way.
 *
 * Shiki writes every token as a span of its own, and the page carries each
 * span twice, once in the DOM and once in the RSC payload. The 121 fences
 * of `/api/` held 8,821 token spans, and 4,676 are left once this
 * transformer drops the spans that change nothing a reader sees. Tokens in
 * white space or in the theme's default foreground become text, and
 * neighbouring tokens of one class merge into one span.
 *
 * A foreground token keeps its colour through inheritance. Nextra colours a
 * fence with `.nextra-code span { color: var(--shiki-light) }` (and
 * `--shiki-dark` in dark mode), and a custom property inherits. This sets the
 * foreground's class (`foreground` in `code-classes.mjs`) once on the
 * `<code>`, so the line span around the token's text takes the same colour.
 * A space shows no colour.
 *
 * Each line keeps its span, and the text of every line stays as it was, so
 * the copy button and Pagefind read the same text. A token that holds a hover
 * (`popup-fold.mjs`) or carries an inline style keeps its span.
 *
 * The line span takes the foreground from `<code>`, and so would any other
 * span between the `<code>` and a token. So a fence whose lines hold anything
 * but tokens and text keeps every token as Shiki wrote it, such as a fence
 * with a Twoslash error line. A fence with a `^?` query keeps its tokens too,
 * since the persisted card sits inside a token. So does a fence whose meta
 * highlights lines (`{1,3}`) or characters (`/word/`), since the highlight
 * colours the line span.
 *
 * Inline code (`` `x{:ts}` ``) keeps its tokens too. rehype-pretty-code
 * highlights it with no meta at all, and Nextra's `rehypeAttachCodeMeta`
 * drops the inline `<code>`'s class, which would leave folded text in the
 * prose colour.
 *
 * It runs in Shiki's `root` hook after `codeClasses` has put the classes on
 * the tokens.
 */
import { foreground } from './code-classes.mjs';

const TOKEN_CLASS = /^sh-[\w-]+$/;

/** rehype-pretty-code's line and character highlight meta. */
const HIGHLIGHT = [/\B\{(.*?)\}\B/, /(["/]).*?\1\S*/];

const isText = (node) => node.type === 'text';

const isSpan = (node) =>
  node.type === 'element' && node.tagName.toLowerCase() === 'span';

function classOf(node) {
  const held = node.properties?.class ?? node.properties?.className;
  return Array.isArray(held) ? held.join(' ') : held;
}

/** A token as Shiki writes one: a span with a class or a style, nothing else. */
function isToken(node) {
  if (!isSpan(node)) return false;
  const keys = Object.keys(node.properties ?? {});
  return (
    keys.length > 0 &&
    keys.every((key) => key === 'class' || key === 'style') &&
    (keys.includes('style') || TOKEN_CLASS.test(classOf(node) ?? ''))
  );
}

/** A token whose span can go or merge: one class, and text only. */
function isPlain(node) {
  return (
    isToken(node) &&
    node.properties.style === undefined &&
    (node.children ?? []).every(isText)
  );
}

const textOf = (node) =>
  isText(node) ? node.value : node.children.map(textOf).join('');

/** A line's children with the spans that change nothing taken out. */
function foldLine(children) {
  const out = [];
  for (const child of children) {
    const plain = isPlain(child);
    const value = plain ? textOf(child) : undefined;
    const node =
      plain && (classOf(child) === foreground || value.trim() === '')
        ? { type: 'text', value }
        : child;
    const last = out.at(-1);
    if (last && isText(node) && isText(last)) {
      out[out.length - 1] = { type: 'text', value: last.value + node.value };
    } else if (
      last &&
      isPlain(node) &&
      isPlain(last) &&
      classOf(node) === classOf(last)
    ) {
      out[out.length - 1] = {
        ...last,
        children: [{ type: 'text', value: textOf(last) + textOf(node) }],
      };
    } else out.push(node);
  }
  return out;
}

const isLine = (node) => isSpan(node) && classOf(node) === 'line';

/**
 * Whether every line of `code` holds only tokens and text, the shape whose
 * colour the fold keeps.
 */
function onlyTokens(code) {
  return (code.children ?? []).every(
    (child) =>
      (isText(child) && child.value.trim() === '') ||
      (isLine(child) &&
        (child.children ?? []).every(
          (part) => isText(part) || (isToken(part) && !holdsQuery(part)),
        )),
  );
}

/**
 * Whether a fence's meta asks rehype-pretty-code to highlight a part of it.
 * Nextra has already taken `filename="…"` out of the meta it hands on.
 */
export function highlights(meta = '') {
  return HIGHLIGHT.some((pattern) => pattern.test(meta));
}

/** A twoslash `^?` query's card, which renders inside the line. */
const QUERY = /(^|\s)twoslash-query-/;

const holdsQuery = (node) =>
  QUERY.test(classOf(node) ?? '') || (node.children ?? []).some(holdsQuery);

/** The Shiki transformer that folds the token spans of a page fence. */
export function tokenFold() {
  return {
    name: '@nexusdi/docs:token-fold',
    root(tree) {
      // A block always has a meta string, empty or not; inline code has none.
      const meta = this.options.meta?.__raw;
      if (meta === undefined || highlights(meta)) return;
      for (const pre of tree.children) {
        const code = (pre.children ?? []).find(
          (child) => child.type === 'element' && child.tagName === 'code',
        );
        if (!code || !onlyTokens(code)) continue;
        for (const line of code.children)
          if (isLine(line)) line.children = foldLine(line.children);
        code.properties = {
          ...code.properties,
          class: [classOf(code), foreground].filter(Boolean).join(' '),
        };
      }
    },
  };
}
