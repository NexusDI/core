import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Holds the exported site to the limits that decide how fast a visitor gets a
 * usable page (owner ruling, 2026-11-01: the docs site enforces no size except
 * what affects performance for the people visiting it; site UX spec 12.1).
 *
 * Two kinds of row exist. A gate row fails the build. It bounds what a page
 * loads before the visitor can use it: the scripts and stylesheets its HTML
 * names, the fonts it preloads, the hero image that paints the LCP, and one
 * guard against a giant asset. A report row only prints. It covers bytes that
 * load after idle or on interaction, bytes that no visitor downloads, and
 * bookkeeping, so growth there starts a conversation in review and fails
 * nothing.
 *
 * Each ceiling names its measurement of 2026-11-01 and its headroom, so
 * ordinary feature work does not trip it.
 */

/**
 * The route types. A page is a `front` page, an `api` page (`/api/` and the
 * package pages `/api-<name>/`), a `tool` route or, with everything else, a
 * `guide`. Nextra serves every MDX page from one
 * catch-all route, so the types differ in their ceilings and not in what they
 * load today.
 */
export function routeType(path) {
  if (path === 'index.html') return 'front';
  if (path.startsWith('api/') || path.startsWith('api-')) return 'api';
  if (TOOL_ROUTES.some((route) => path.startsWith(route))) return 'tool';
  return 'guide';
}

const TOOL_ROUTES = ['playground/', 'academy/'];

/**
 * First-load JavaScript per route type, gzipped, in bytes: every script the
 * page's HTML names, the shared chunks included, and no `nomodule` script (a
 * modern browser skips it; the report prints it apart). That is what the
 * browser downloads, parses and runs before the page takes input, and on a
 * mid-range phone the parse and run time grows with it. The content types
 * measure 239.3 kB today (headroom 30 percent). A tool route loads the
 * Playground or Academy shell on top of the shared load. The old tool row
 * allowed 200 kB of that, so its ceiling is 440 kB; no build has measured a
 * tool route since the budget rework.
 */
export const FIRST_LOAD_JS = {
  guide: 310_000,
  front: 310_000,
  api: 310_000,
  tool: 440_000,
};

/**
 * The stylesheets a page names block its first paint, so they get their own
 * ceiling per page, gzipped, whatever path they load from. They measure
 * 26.9 kB today with /code-classes.css (headroom 26 percent).
 */
export const CSS_BUDGET = 34_000;

/**
 * The ceiling on the HTML document of one page, gzipped. The HTML is content
 * the reader came for (`/api/` lists core's behaviour sentences and measures
 * 209.4 kB), so this row does not trim it. It stops a runaway: at Lighthouse's
 * mobile profile of 1.6 Mbps, 400 kB takes two seconds to download, which
 * delays first paint by that long even with streaming. The ceiling sits
 * 91 percent over the measurement.
 */
export const HTML_BUDGET = 400_000;

/**
 * The ceiling on one font file that a page preloads, in bytes. The files are
 * woff2, so the size is the transfer size. The largest measures 24.3 kB (headroom 32 percent).
 */
export const FONT_FILE_BUDGET = 32_000;

/**
 * The ceiling on one hero image, in bytes. The hero is the picture of the
 * front page whose `<img>` carries `fetchpriority="high"`, the LCP element on a
 * wide screen and on a phone (site UX spec 12.3). The check reads every
 * `srcset` URL and the `src` of that picture from `index.html`. The largest
 * file, the 1536 WebP fallback, measures 34.7 kB (headroom 73 percent).
 */
export const HERO_BUDGET = 60_000;

/**
 * The guard against a committed giant: any image or font in the export over
 * this many bytes fails. The largest measures under 100 kB today, so the
 * guard has 900 kB of headroom.
 */
export const GIANT_ASSET = 1_000_000;

const GIANT_EXTENSIONS =
  /\.(avif|webp|png|jpe?g|gif|svg|ico|woff2?|ttf|otf|eot)$/i;

/** The front page's bay controller (site UX spec 12.1). */
export const BAY_MARK = 'nexus-preflight-bay';
/** The core runtime chunk: core, `errors`, devtools' `trace` and `inspect`, and a scene's seed. */
export const RUNTIME_MARK = 'nexus-core-runtime';
/**
 * The bay's light chunk: the deck state, the Pixi view and the cutaway's data
 * layers (site UX spec 12.1, owner ruling OR5). It loads once the bay is half
 * in view and idle.
 */
export const LIGHT_MARK = 'nexus-bay-light';

/**
 * The markers, in the order `classify` tries them. A chunk carries one marker
 * at most. A chunk with none is `page` JavaScript.
 */
const MARKS = [
  ['bay', BAY_MARK],
  ['runtime', RUNTIME_MARK],
  ['light', LIGHT_MARK],
];

/** The chunks that no page names, each with the marker its chunk carries. */
const LAZY_ROWS = [
  { row: 'bay', mark: BAY_MARK, label: 'bay controller' },
  { row: 'runtime', mark: RUNTIME_MARK, label: 'core runtime' },
  { row: 'light', mark: LIGHT_MARK, label: 'bay light' },
];

/** The row a chunk's source counts against: its marker's, or `page`. */
export function classify(source) {
  for (const [kind, mark] of MARKS) if (source.includes(mark)) return kind;
  return 'page';
}

// Next exports its error pages as index.html files that skip the theme chunks.
const NOT_PAGES = ['_next/', '_not-found/', '404/'];

function pages(out) {
  return readdirSync(out, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'index.html')
    .map((entry) =>
      relative(out, join(entry.parentPath, entry.name)).split(sep).join('/'),
    )
    .filter((path) => !NOT_PAGES.some((prefix) => path.startsWith(prefix)))
    .sort();
}

const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

/** The attributes of one start tag, by lower-case name; a bare attribute is ''. */
function attrsOf(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([a-z][\w:-]*)(?:\s*=\s*"([^"]*)")?/gi))
    attrs[match[1].toLowerCase()] ??= match[2] ?? '';
  return attrs;
}

/**
 * The export path a URL names, or null for an external one: the query and
 * fragment go, and so does the base path.
 */
function localPath(url, basePath) {
  const bare = url.replace(/[?#].*$/, '');
  if (basePath && bare.startsWith(`${basePath}/`))
    return bare.slice(basePath.length);
  return bare.startsWith('/') && !bare.startsWith('//') ? bare : null;
}

/**
 * The scripts and stylesheets a page's HTML loads, base path stripped. A
 * `nomodule` script goes in `noModule`, and a stylesheet counts from any path.
 */
export function assetsOf(html, basePath) {
  const scripts = new Set();
  const noModule = new Set();
  const styles = new Set();
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const attrs = attrsOf(tag);
    if (tag.toLowerCase().startsWith('<script')) {
      const path = attrs.src ? localPath(attrs.src, basePath) : null;
      if (path?.endsWith('.js'))
        ('nomodule' in attrs ? noModule : scripts).add(path);
    } else if ((attrs.rel ?? '').toLowerCase() === 'stylesheet') {
      const path = attrs.href ? localPath(attrs.href, basePath) : null;
      if (path) styles.add(path);
    }
  }
  return {
    scripts: [...scripts],
    noModule: [...noModule],
    styles: [...styles],
  };
}

/** The font files a page's HTML preloads, base path stripped. */
export function fontsOf(html, basePath) {
  return [
    ...new Set(
      [...html.matchAll(/<link\b[^>]*>/gi)]
        .map((match) => attrsOf(match[0]))
        .filter((attrs) => (attrs.as ?? '').toLowerCase() === 'font')
        .flatMap((attrs) => {
          const path = attrs.href ? localPath(attrs.href, basePath) : null;
          return path ? [path] : [];
        }),
    ),
  ];
}

/**
 * The files of the hero picture: the `<picture>` that holds the `<img>` with
 * `fetchpriority="high"`, every `srcset` URL of its sources and the `src` of
 * the image. An empty list means the page has no such image.
 */
export function heroOf(html, basePath) {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const img = attrsOf(match[0]);
    if ((img.fetchpriority ?? '').toLowerCase() !== 'high') continue;
    const before = html.slice(0, match.index);
    const open = before.toLowerCase().lastIndexOf('<picture');
    const closed = before.toLowerCase().lastIndexOf('</picture');
    const picture = open > closed ? before.slice(open) : '';
    const urls = [
      ...[...picture.matchAll(/<source\b[^>]*>/gi)].flatMap((source) =>
        (attrsOf(source[0]).srcset ?? '')
          .split(',')
          .map((entry) => entry.trim().split(/\s+/)[0])
          .filter(Boolean),
      ),
      img.src,
    ];
    return [
      ...new Set(
        urls.flatMap((url) => {
          const path = url ? localPath(url, basePath) : null;
          return path ? [path] : [];
        }),
      ),
    ];
  }
  return [];
}

/**
 * The elements a page's HTML carries, the DOM it starts with: every start
 * tag but a `<script>`'s, whose contents are the RSC payload. A scan, so
 * a `<script>` closed as `</script >` or not closed at all skips the same
 * way the browser's parser does: to its end tag, or to the end of the page.
 */
export function elementsOf(html) {
  const lower = html.toLowerCase();
  let count = 0;
  let at = lower.indexOf('<');
  while (at !== -1) {
    if (/^<script[\s>/]/i.test(lower.slice(at, at + 8))) {
      const end = lower.indexOf('</script', at);
      if (end === -1) return count;
      at = end;
    } else if (/[a-z]/.test(lower[at + 1] ?? '')) count += 1;
    at = lower.indexOf('<', at + 1);
  }
  return count;
}

/**
 * Measures every exported page: the scripts and stylesheets its HTML names
 * (gzipped and raw), the `nomodule` scripts apart, the fonts it preloads, and
 * its HTML. A named file that the export lacks lands in `missing`.
 */
export function measurePages(out, { basePath = '' } = {}) {
  const sizes = new Map();
  const size = (file) => {
    if (!sizes.has(file)) {
      try {
        const text = readFileSync(join(out, file));
        sizes.set(file, { raw: text.length, gzip: gzipSync(text).length });
      } catch {
        sizes.set(file, null);
      }
    }
    return sizes.get(file);
  };
  return pages(out).map((path) => {
    const raw = readFileSync(join(out, path));
    const html = raw.toString('utf8');
    const assets = assetsOf(html, basePath);
    const missing = [];
    const total = (list) =>
      list.reduce(
        (sum, file) => {
          const found = size(file);
          if (!found) missing.push(file);
          return {
            raw: sum.raw + (found?.raw ?? 0),
            gzip: sum.gzip + (found?.gzip ?? 0),
          };
        },
        { raw: 0, gzip: 0 },
      );
    return {
      path,
      type: routeType(path),
      js: { ...total(assets.scripts), count: assets.scripts.length },
      noModule: total(assets.noModule),
      css: { ...total(assets.styles), count: assets.styles.length },
      missing,
      fonts: fontsOf(html, basePath).flatMap((file) => {
        try {
          return [{ file, bytes: statSync(join(out, file)).size }];
        } catch {
          return [];
        }
      }),
      htmlGzip: gzipSync(raw).length,
      elements: elementsOf(html),
    };
  });
}

/**
 * The gate rows over the measured pages: first-load JavaScript per route type,
 * the stylesheets, the HTML document and each preloaded font file.
 */
export function checkPages(rows) {
  const findings = [];
  for (const row of rows) {
    const limit = FIRST_LOAD_JS[row.type];
    if (row.js.count === 0 || row.css.count === 0)
      findings.push(
        `${row.path}: the HTML names ${row.js.count} scripts and ${row.css.count} stylesheets. A page with none means the measurement lost its assets (a ?dpl= query, an assetPrefix or a DOCS_BASE_PATH that does not match the build).`,
      );
    for (const file of row.missing)
      findings.push(
        `${row.path}: the HTML names ${file}, which the export does not hold.`,
      );
    if (row.js.gzip > limit)
      findings.push(
        `${row.path}: ${row.type} first-load JavaScript is ${kB(row.js.gzip)} gzipped, over the ${limit / 1000} kB ceiling. Load the code with import() on use, or raise FIRST_LOAD_JS.${row.type} with the new measurement and the reason.`,
      );
    if (row.css.gzip > CSS_BUDGET)
      findings.push(
        `${row.path}: the stylesheets are ${kB(row.css.gzip)} gzipped, over the ${CSS_BUDGET / 1000} kB ceiling. They block the first paint.`,
      );
    if (row.htmlGzip > HTML_BUDGET)
      findings.push(
        `${row.path}: the page's HTML is ${kB(row.htmlGzip)} gzipped, over the ${HTML_BUDGET / 1000} kB ceiling. Move content out of the HTML, as tools/popup-fold.mjs moves the type panels.`,
      );
  }
  const seen = new Set();
  for (const row of rows)
    for (const font of row.fonts) {
      if (seen.has(font.file)) continue;
      seen.add(font.file);
      if (font.bytes > FONT_FILE_BUDGET)
        findings.push(
          `${font.file}: the preloaded font is ${kB(font.bytes)}, over the ${kB(FONT_FILE_BUDGET)} ceiling. Subset it or drop the preload.`,
        );
    }
  return findings;
}

/** The files `next` copied into `out/_next/static/media`, as name and size. */
function mediaFiles(out) {
  const media = join(out, '_next', 'static', 'media');
  try {
    return readdirSync(media).map((name) => ({
      name,
      bytes: statSync(join(media, name)).size,
    }));
  } catch {
    return [];
  }
}

/**
 * The gate rows over the export's files: each file of the hero picture in
 * `index.html` against `HERO_BUDGET` (no hero picture fails), and any image or
 * font anywhere in the export against `GIANT_ASSET`.
 */
export function checkAssets(out, { basePath = '' } = {}) {
  const findings = [];
  let front = '';
  try {
    front = readFileSync(join(out, 'index.html'), 'utf8');
  } catch {
    // The finding below names the missing page.
  }
  const hero = heroOf(front, basePath);
  if (hero.length === 0)
    findings.push(
      'index.html: no <picture> holds an <img fetchpriority="high">, so the check finds no LCP image. Mark the hero image with fetchPriority="high".',
    );
  for (const file of hero) {
    let bytes = 0;
    try {
      bytes = statSync(join(out, file)).size;
    } catch {
      findings.push(
        `${file}: the hero picture names a file that the export does not hold.`,
      );
    }
    if (bytes > HERO_BUDGET)
      findings.push(
        `${file}: the hero image is ${kB(bytes)}, over the ${kB(HERO_BUDGET)} ceiling. It paints the LCP element; run tools/ship-art.mjs with a lower quality.`,
      );
  }
  const files = readdirSync(out, { recursive: true, withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile() || !GIANT_EXTENSIONS.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    const bytes = statSync(path).size;
    if (bytes > GIANT_ASSET)
      findings.push(
        `${relative(out, path).split(sep).join('/')}: the file is ${kB(bytes)}, over the ${kB(GIANT_ASSET)} guard for one image or font.`,
      );
  }
  return findings;
}

/**
 * The chunk lists of the `import()` calls of a build, as Turbopack writes
 * them: `Promise.all(["static/chunks/a.js","static/chunks/b.js"].map(...))`.
 * Each list is one group, the chunks that one `import()` loads together. A
 * chunk that two groups share, such as core, sits in both lists.
 */
export function importGroups(sources) {
  const groups = [];
  const open = 'Promise.all([';
  for (const source of sources) {
    // indexOf scans each list once, so a long or broken list takes linear time.
    // A list counts only when it holds quoted names alone, as Turbopack writes it.
    let at = source.indexOf(open);
    while (at !== -1) {
      const start = at + open.length;
      const end = source.indexOf(']', start);
      if (end === -1) break;
      const list = source.slice(start, end);
      const names = /^[\s,]*$/.test(list.replace(/"[^"]*"/g, ''));
      const chunks = (names ? [...list.matchAll(/"([^"]*)"/g)] : [])
        .map((each) => each[1])
        .filter((path) => path.endsWith('.js'));
      if (chunks.length > 0) groups.push(chunks);
      at = source.indexOf(open, end);
    }
  }
  return groups;
}

/**
 * The PNG files that a chunk's modules emit, such as the cutaway's masks,
 * which the light fetches.
 */
const MEDIA = /\/_next\/static\/media\/([^"'\s)]+\.png)/g;

/**
 * Report rows for the chunks that a page loads with `import()`: the bay
 * controller, the run chunk and the light chunk. They load when the bay nears
 * the viewport, and the light waits for idle, so they never delay a first
 * view and no row fails. A row is the group of the `import()` that loads the
 * chunk carrying the row's marker: that chunk, the unmarked chunks that group
 * lists with it and the media its chunks emit. A chunk that two groups share
 * counts once in each. A row with no marked chunk reports a note, since a
 * minifier that dropped the marker would otherwise hide the group.
 */
export function measureLazyChunks(out) {
  const root = join(out, '_next', 'static');
  let files = [];
  try {
    files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => join(entry.parentPath, entry.name));
  } catch {
    return {
      notes: [
        `${relative(out, root)} does not exist. Run the docs build before the budget check.`,
      ],
      rows: [],
    };
  }
  const sources = new Map(
    files.map((file) => [
      relative(root, file).split(sep).join('/'),
      readFileSync(file, 'utf8'),
    ]),
  );
  const groups = importGroups([...sources.values()]).map((paths) =>
    paths.map((path) => path.replace(/^static\//, '')),
  );
  const rows = [];
  const notes = [];
  for (const lazy of LAZY_ROWS) {
    const marked = [...sources].filter(
      ([, source]) => classify(source) === lazy.row,
    );
    const markedPaths = new Set(marked.map(([path]) => path));
    const listed = new Set(markedPaths);
    for (const group of groups)
      if (group.some((path) => markedPaths.has(path)))
        for (const path of group) if (sources.has(path)) listed.add(path);
    const chunks = [...listed].map((path) => ({
      file: `_next/static/${path}`,
      gzip: gzipSync(sources.get(path) ?? '').length,
      split: !marked.some(([markedPath]) => markedPath === path),
    }));
    const media = new Set();
    for (const path of listed)
      for (const match of (sources.get(path) ?? '').matchAll(MEDIA))
        media.add(match[1]);
    let mediaBytes = 0;
    for (const name of media) {
      try {
        mediaBytes += statSync(join(root, 'media', name)).size;
      } catch {
        // A path that names no file adds nothing.
      }
    }
    const gzip =
      chunks.reduce((sum, chunk) => sum + chunk.gzip, 0) + mediaBytes;
    rows.push({
      row: lazy.row,
      label: lazy.label,
      chunks,
      gzip,
      media: mediaBytes,
    });
    if (marked.length === 0)
      notes.push(
        `No chunk under _next/static carries the ${lazy.mark} marker. The bay must import its marker function after the import() so that a minifier keeps the string.`,
      );
  }
  return { notes, rows };
}

/** The report rows for the behaviour sidecars, `out/behaviour/<dir>/<name>.json`, largest first. */
export function measureBehaviour(out) {
  const root = join(out, 'behaviour');
  let entries;
  try {
    entries = readdirSync(root, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      const text = readFileSync(path);
      return {
        path: relative(out, path).split(sep).join('/'),
        raw: text.length,
        gzip: gzipSync(text).length,
      };
    })
    .sort((left, right) => right.raw - left.raw);
}

/** The lines the build log prints, none of which fails the build. */
export function reportLines(out, rows) {
  const lines = [];
  const { rows: lazy, notes } = measureLazyChunks(out);
  for (const row of lazy)
    lines.push(
      `report: ${row.label} ${kB(row.gzip)} gzipped in ${row.chunks.length} chunk${row.chunks.length === 1 ? '' : 's'}${row.media > 0 ? `, ${kB(row.media)} of it media` : ''}, loads after the bay is in view`,
    );
  lines.push(...notes.map((note) => `report: ${note}`));
  const [heaviest] = [...rows].sort((a, b) => b.htmlGzip - a.htmlGzip);
  if (heaviest)
    lines.push(
      `report: the heaviest page is ${heaviest.path}: ${kB(heaviest.htmlGzip)} of HTML gzipped`,
    );
  const [densest] = [...rows].sort((a, b) => b.elements - a.elements);
  if (densest)
    lines.push(
      `report: the page with the most elements is ${densest.path}: ${densest.elements} elements`,
    );
  const [legacy] = [...rows].sort((a, b) => b.noModule.gzip - a.noModule.gzip);
  if (legacy)
    lines.push(
      `report: nomodule scripts, which modern browsers skip, are up to ${kB(legacy.noModule.gzip)} gzipped on ${legacy.path}`,
    );
  const behaviour = measureBehaviour(out);
  if (behaviour[0])
    lines.push(
      `report: ${behaviour.length} behaviour sidecars, fetched on demand; the largest is ${behaviour[0].path} at ${kB(behaviour[0].raw)} raw, ${kB(behaviour[0].gzip)} gzipped`,
    );
  const media = mediaFiles(out).filter((file) =>
    /\.(avif|webp|png)$/.test(file.name),
  );
  const sum = media.reduce((all, file) => all + file.bytes, 0);
  lines.push(
    `report: ${media.length} images under _next/static/media, ${kB(sum)} together`,
  );
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.env.DOCS_OUT ?? join(import.meta.dirname, '..', 'out');
  const basePath = process.env.DOCS_BASE_PATH ?? '';
  const rows = measurePages(out, { basePath });
  for (const type of Object.keys(FIRST_LOAD_JS)) {
    const own = rows.filter((row) => row.type === type);
    if (own.length === 0) {
      console.log(`${type}: no pages in this build`);
      continue;
    }
    const js = Math.max(...own.map((row) => row.js.gzip));
    const css = Math.max(...own.map((row) => row.css.gzip));
    console.log(
      `${type}: ${own.length} page${own.length === 1 ? '' : 's'}, first-load JavaScript up to ${kB(js)} gzipped of ${FIRST_LOAD_JS[type] / 1000} kB, stylesheets up to ${kB(css)} of ${CSS_BUDGET / 1000} kB`,
    );
  }
  for (const line of reportLines(out, rows)) console.log(line);
  const findings = [...checkPages(rows), ...checkAssets(out, { basePath })];
  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exit(1);
  }
}
