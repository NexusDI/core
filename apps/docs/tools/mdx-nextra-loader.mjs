/**
 * Nextra's MDX loader, with this site's Shiki transformers added to the ones
 * it hands Shiki.
 *
 * Nextra's hook for a Shiki transformer is
 * `mdxOptions.rehypePrettyCodeOptions.transformers`, which its loader appends
 * after its own Twoslash transformer (`nextra/dist/server/loader.js`). Under
 * Turbopack a loader's options cross into Rust as JSON, so a transformer, an
 * object of functions, cannot be set in `next.config.ts`. This loader takes
 * Nextra's place in the rules `next.config.ts` swaps it into, and builds the
 * option inside the loader worker, where functions exist.
 *
 * `nextraLoader` is the path of the loader it stands in for, which Nextra
 * keeps out of its package's `exports`.
 *
 * Ported from `Evanion/libraries` `apps/docs/tools/mdx-nextra-loader.mjs` at
 * 670ac27f.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';

import { codeClasses } from './code-classes.mjs';
import { mapFences } from './fences.mjs';
import { popupFold, tableOf } from './popup-fold.mjs';
import { tokenFold } from './token-fold.mjs';

const require = createRequire(import.meta.url);

const content = join(import.meta.dirname, '..', 'content');
const popups = join(import.meta.dirname, '..', 'public', 'popups');

/**
 * Where a page's hover table goes: `public/popups/<route>.json`, named after
 * the page's route, the path `PagePopover.tsx` reads off the URL. A folder's
 * `index.mdx` is its folder's route, and `content/index.mdx` is `index`. A
 * page outside `content/` gets none.
 */
export function tableFor(file) {
  const path = relative(content, file);
  if (path.startsWith('..')) return null;
  const route = path
    .split(sep)
    .join('/')
    .replace(/\.mdx?$/, '')
    .replace(/(^|\/)index$/, '');
  return join(popups, `${route === '' ? 'index' : route}.json`);
}

/**
 * A `twoslash` fence, after the loader chain's prelude has run. Nextra
 * reads exactly this meta.
 */
const TWOSLASH = /^\s*`{3,}tsx? twoslash\s*$/m;

/**
 * The page with `<TypeCards />` at its end when it has a `twoslash` fence.
 * The card mounts inside the page's own tree, so a client navigation to
 * another page mounts a new one, which reads that page's table, and a page
 * without a typed token never loads it (`components/twoslash/TypeCards.tsx`).
 */
function withTypeCards(source) {
  return TWOSLASH.test(source)
    ? `${source.trimEnd()}\n\n<TypeCards />\n`
    : source;
}

/** The `requires: [a, b]` line of a page's frontmatter. */
const REQUIRES = /^requires:\s*\[([^\]]*)\]\s*$/m;

/**
 * The page with `<Prerequisites requires={[…]} />` above its first H2, from
 * the `requires` frontmatter a teaching page carries (site UX spec 13.2). A
 * page without `requires`, or without an H2, passes through. A `## ` line
 * inside a fence is no heading, so the scan skips fences.
 */
export function withPrerequisites(source) {
  const front = source.match(/^---\n([\s\S]*?)\n---\n/);
  const requires = front?.[1]
    .match(REQUIRES)?.[1]
    .split(',')
    .map((slug) => slug.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  if (!front || !requires || requires.length === 0) return source;

  const body = source.slice(front[0].length);
  // Fences become a placeholder line, so only prose lines can match.
  const lines = mapFences(body, ({ opener, body: inner, closer }) => [
    ...[opener, ...inner, closer].map(() => '\u0000fence'),
  ]).split('\n');
  const at = lines.findIndex((line) => /^## /.test(line));
  if (at === -1) return source;

  const real = body.split('\n');
  real.splice(
    at,
    0,
    `<Prerequisites requires={${JSON.stringify(requires)}} />`,
    '',
  );
  return `${front[0]}${real.join('\n')}`;
}

/** Writes a page's table, or removes a stale one when the page has none. */
function write(file, panels) {
  const target = tableFor(file);
  if (!target) return;
  if (panels.size === 0) {
    rmSync(target, { force: true });
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify(Object.fromEntries([...panels].sort(([a], [b]) => a.localeCompare(b))))}\n`,
  );
}

export default function loader(source) {
  // Turbopack tracks a loader's own file and not what it imports, so a change
  // to a transformer would otherwise leave every page compiled by the old one.
  this.addDependency(join(import.meta.dirname, 'code-classes.mjs'));
  this.addDependency(join(import.meta.dirname, 'popup-fold.mjs'));
  this.addDependency(join(import.meta.dirname, 'token-fold.mjs'));
  const { nextraLoader, ...options } = this.getOptions();
  const mdxOptions = options.mdxOptions ?? {};
  const prettyCode = mdxOptions.rehypePrettyCodeOptions ?? {};

  // The page's hover table, read from the keys the compiled page carries
  // once Nextra's loader is done with it.
  const file = this.resourcePath;
  const finish = this.async.bind(this);
  this.async = () => {
    const callback = finish();
    return (error, compiled, ...rest) => {
      if (error) return callback(error, compiled, ...rest);
      try {
        write(file, tableOf(String(compiled)));
      } catch (thrown) {
        return callback(thrown);
      }
      return callback(null, compiled, ...rest);
    };
  };

  this.getOptions = () => ({
    ...options,
    mdxOptions: {
      ...mdxOptions,
      rehypePrettyCodeOptions: {
        ...prettyCode,
        // In this order: the panels are folded with the token classes
        // already on their spans, and the tokens with each hover already a
        // button.
        transformers: [
          ...(prettyCode.transformers ?? []),
          codeClasses(),
          popupFold(),
          tokenFold(),
        ],
      },
    },
  });

  return require(nextraLoader).call(
    this,
    withTypeCards(withPrerequisites(source)),
  );
}
