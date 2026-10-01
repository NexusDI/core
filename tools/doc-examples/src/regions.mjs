/**
 * Named regions in a markdown file or a TypeScript source, so the docs app can
 * render the same example the package ships rather than a copy of it.
 *
 * In markdown a region is a pair of HTML comments around a fenced code block:
 *
 *     <!-- #region quick-start -->
 *     ```ts @import.meta.vitest
 *     …
 *     ```
 *     <!-- #endregion quick-start -->
 *
 * HTML comments because GitHub and npm render markdown and drop them, so the
 * README a reader sees is unmarked. The markers sit outside the fence rather
 * than inside it so that the extracted text is code, with no marker lines to
 * strip and no marker visible in the README's own rendering.
 *
 * In a `.ts` or `.tsx` source a region is a pair of line comments, and the code
 * between them is the example:
 *
 *     // #region widen
 *     expectTypeOf(widen(listing)).toEqualTypeOf<Listing>();
 *     // #endregion widen
 *
 * `// #region` is TypeScript's and VS Code's own folding marker, so the markers
 * fold in an editor and mean nothing to the compiler. This is what puts a
 * type-level claim on a docs page: `expectTypeOf` and `@ts-expect-error` live in
 * a `*.test-d.ts` file, which has no README fence to sit in, and the claim the
 * page renders is then the one `tsc` checked.
 *
 * An `.astro` component is two languages in one file, so it takes both marker
 * spellings. The frontmatter is TypeScript and takes the line comment above.
 * The template is JSX and takes the expression comment Astro already supports
 * there:
 *
 *     {/* #region checkout-gate *\/}
 *     <button disabled={!mayOrder}>Place the order</button>
 *     {/* #endregion checkout-gate *\/}
 *
 * The extracted block is executed, because the file it comes from is executed —
 * the docs app inherits that guarantee rather than adding one.
 */

const REGION = /<!--\s*#region\s+([\w-]+)\s*-->/;
const ENDREGION = /<!--\s*#endregion\s+([\w-]+)\s*-->/;
const SOURCE_REGION = /^\s*(?:\/\/|\{\/\*)\s*#region\s+([\w-]+)\s*(?:\*\/\})?$/;
const SOURCE_ENDREGION =
  /^\s*(?:\/\/|\{\/\*)\s*#endregion\s+([\w-]+)\s*(?:\*\/\})?$/;
const SOURCE_FILE = /\.(?:tsx?|astro)$/;
const FENCE = /^\s*(`{3,})(.*)$/;

/** A malformed or missing region, with the file and line in its message. */
export class RegionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegionError';
  }
}

/**
 * Reads every named region out of a source, markdown or TypeScript.
 *
 * The file extension picks the marker syntax. A caller passes the path it read
 * the source from, which every caller already has, so nothing has to name the
 * two modes at a call site.
 */
export function parseRegions(source, file) {
  return SOURCE_FILE.test(file)
    ? parseSourceRegions(source, file)
    : parseMarkdownRegions(source, file);
}

/**
 * The region body, with the indentation its enclosing block gave it removed.
 *
 * A type-level claim sits inside a `describe` or an `it`, so the lines carry
 * two or four spaces that belong to the test file and not to the example. The
 * blank lines the markers usually stand apart from go with them.
 */
function body(lines) {
  const trimmed = [...lines];
  while (trimmed.length && !trimmed[0].trim()) trimmed.shift();
  while (trimmed.length && !trimmed[trimmed.length - 1].trim()) trimmed.pop();

  const indents = trimmed
    .filter((line) => line.trim())
    .map((line) => line.length - line.trimStart().length);
  const width = indents.length ? Math.min(...indents) : 0;

  return trimmed.map((line) => line.slice(width)).join('\n');
}

/** The Shiki language a source file's regions render as. */
function sourceLang(file) {
  if (file.endsWith('.astro')) return 'astro';
  return file.endsWith('.tsx') ? 'tsx' : 'ts';
}

/**
 * Every named region in a `.ts`, `.tsx` or `.astro` source.
 *
 * No fence to delimit the block, so the region is the lines between the
 * markers. The language is the extension: a `.tsx` example renders as `tsx`
 * and an `.astro` one as `astro`, which is what Shiki needs to highlight the
 * JSX and the frontmatter in them.
 */
function parseSourceRegions(source, file) {
  const regions = new Map();

  let open = null;
  let lines = [];

  source.split('\n').forEach((line, index) => {
    const start = line.match(SOURCE_REGION);
    if (start) {
      if (open) {
        throw new RegionError(
          `${file}:${index + 1}: region '${start[1]}' opens inside region '${open.name}'`,
        );
      }
      open = { name: start[1], at: index + 1 };
      lines = [];
      return;
    }

    const end = line.match(SOURCE_ENDREGION);
    if (end) {
      if (!open) {
        throw new RegionError(
          `${file}:${index + 1}: #endregion '${end[1]}' closes nothing`,
        );
      }
      if (end[1] !== open.name) {
        throw new RegionError(
          `${file}:${index + 1}: #endregion '${end[1]}' closes region '${open.name}'`,
        );
      }
      if (regions.has(open.name)) {
        throw new RegionError(
          `${file}:${index + 1}: region '${open.name}' is defined twice`,
        );
      }
      regions.set(open.name, { lang: sourceLang(file), code: body(lines) });
      open = null;
      return;
    }

    if (open) lines.push(line);
  });

  if (open) {
    throw new RegionError(
      `${file}:${open.at}: region '${open.name}' is never closed`,
    );
  }

  return regions;
}

/**
 * Every named region in a markdown source.
 *
 * A region must contain exactly one fenced block. Anything else — prose
 * between the markers, two blocks, none — is an error rather than a
 * best-effort extraction, because the failure it prevents is a docs page
 * quietly rendering the wrong thing.
 */
function parseMarkdownRegions(source, file) {
  const lines = source.split('\n');
  const regions = new Map();

  let open = null;
  let fence = null;
  let lang = '';
  let body = [];
  let blocks = 0;

  lines.forEach((line, index) => {
    const start = line.match(REGION);
    if (start && fence === null) {
      if (open) {
        throw new RegionError(
          `${file}:${index + 1}: region '${start[1]}' opens inside region '${open.name}'`,
        );
      }
      open = { name: start[1], at: index + 1 };
      blocks = 0;
      return;
    }

    const end = line.match(ENDREGION);
    if (end && fence === null) {
      if (!open) {
        throw new RegionError(
          `${file}:${index + 1}: #endregion '${end[1]}' closes nothing`,
        );
      }
      if (end[1] !== open.name) {
        throw new RegionError(
          `${file}:${index + 1}: #endregion '${end[1]}' closes region '${open.name}'`,
        );
      }
      if (blocks !== 1) {
        throw new RegionError(
          `${file}:${open.at}: region '${open.name}' wraps ${blocks} code blocks, expected exactly 1`,
        );
      }
      if (regions.has(open.name)) {
        throw new RegionError(
          `${file}:${index + 1}: region '${open.name}' is defined twice`,
        );
      }
      regions.set(open.name, { lang, code: body.join('\n') });
      open = null;
      return;
    }

    if (!open) return;

    const marker = line.match(FENCE);
    if (marker && fence === null) {
      fence = marker[1];
      // The fence info carries the doctest marker, which is meaningful to the
      // test run and noise on a docs page.
      lang = marker[2].replace('@import.meta.vitest', '').trim();
      body = [];
      blocks++;
      return;
    }

    if (marker && fence !== null && marker[1].startsWith(fence)) {
      fence = null;
      return;
    }

    if (fence !== null) body.push(line);
  });

  if (open) {
    throw new RegionError(
      `${file}:${open.at}: region '${open.name}' is never closed`,
    );
  }

  return regions;
}

/**
 * One region, or an error naming what is actually in the file.
 *
 * The list matters: the usual way this fails is a region that was renamed,
 * and the replacement name is almost always in that list.
 */
export function readRegion(source, file, name) {
  const regions = parseRegions(source, file);
  const region = regions.get(name);

  if (!region) {
    const known = [...regions.keys()].sort().join(', ') || 'none';
    throw new RegionError(
      `${file}: no region '${name}'. Regions in this file: ${known}`,
    );
  }

  return region;
}
