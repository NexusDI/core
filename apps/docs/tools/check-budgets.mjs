import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Holds each exported page to the JavaScript budgets of spec §16.2.
 *
 * The shared chunks are the scripts every page references; Nextra and React
 * live there and no row counts them. The rest of a page's scripts count
 * against its row. The console island and the background module carry a
 * marker string in their code, so each counts against its own row wherever it
 * loads.
 */

export const BUDGETS = {
  content: 10_000,
  island: 35_000,
  background: 8_000,
  tool: 200_000,
  // The room labels, their layout and the callout coverage measure 21.0 kB with
  // the controller; 22 kB leaves room for the next label without another ruling.
  bay: 22_000,
  // The run chunk measured 28.1 kB alone. The light chunk imports core too, so
  // Turbopack moved core into a chunk both load, which keeps the exports the
  // deck uses. The two chunks measure 31.0 kB, and `checkMarkedChunks` counts
  // both against this row.
  runtime: 32_000,
  light: 150_000,
};
/**
 * The ceiling on one behaviour sidecar, `out/behaviour/<dir>/<name>.json`,
 * which the catalogue fetches and parses when a reader reaches an entry.
 * Raw bytes are what the browser parses and gzip bytes are what it downloads.
 * The ceilings sit just above the largest sidecar, `core/Nexus.json` with 102
 * cases, at 1350 kB raw and 56.6 kB gzipped.
 *
 * 2026-10-28: the K1 to K4 extension-points tests grew core's sidecar to
 * 1471.1 kB raw and 62.3 kB gzipped, so the ceilings sit at 1550 kB and 65 kB.
 * 2026-10-30: the rc.3 load guard and lazy alias tests grew it to 1575.7 kB
 * raw and 65.8 kB gzipped, so the ceilings sit at 1600 kB and 67 kB.
 * 2026-10-31: the #258 held-ids load tests grew it to 1807.6 kB raw and
 * 75.2 kB gzipped, so the ceilings sit at 1850 kB and 77 kB.
 * Issue #235 tracks sharing the popups once per library in
 * `tools/behaviour-data.mjs`; the ceilings drop again when it lands.
 */
export const BEHAVIOUR_BUDGET = { raw: 1_850_000, gzip: 77_000 };

/**
 * A ratchet on everything one guide page loads, scripts and stylesheets.
 *
 * Nextra 4 serves every MDX page from one catch-all route, so a client
 * component any page reaches ships with every page, and a guide page pays for
 * the reference pages' components. `/scopes/` stands for the guides. The
 * ceiling sits at its measured total; a total over it fails, and a total more
 * than `GUIDE_SLACK` gzipped bytes under it fails too, so a saving lowers the
 * ceiling in the same pull request.
 *
 * Measured at 1004.1 kB raw and 304.1 kB gzipped, so the ceilings sit at
 * 1005 kB and 305 kB. The pre-flight bay adds 1.0 kB of Meridian rules: the
 * terminal's body, the focusable disabled button and the alert banner's line
 * and code link. The schematic, hull crop, switch, step list and painted rules
 * are in `@nexusdi/meridian-ui/schematic.css`, which `Styles.tsx` writes into
 * the front page's HTML with the front page's own stylesheet, and
 * `CopyIsland.tsx` loads its button with `import()`. Next puts any stylesheet
 * or client component a page imports into the route's entry, which every
 * guide loads.
 *
 * Measured earlier at 1003.1 kB raw and 303.7 kB gzipped. The docs chrome (site
 * spec section 13) added the chrome and code stylesheets and the search shell,
 * so the ceilings rose from 984 kB and 299 kB to 1004 kB and 304 kB. The search
 * panel loads with `import()` on the first focus, so it is not in this total.
 *
 * Measured earlier at 982,514 bytes raw and 298,476 gzipped. The Meridian
 * stylesheet carries the Terminal, Button, Status, Alert and HoloLabel
 * classes, so the raw ceiling sat at 984,000. A guide carries
 * `components/twoslash/TypeCards.tsx`, which every page's component map
 * holds, and not the popover it loads: that comes with `import()` on a page
 * with a `twoslash` fence.
 */
export const GUIDE_PAGE = 'scopes/index.html';
export const GUIDE_BUDGET = { raw: 1_005_000, gzip: 305_000 };
export const GUIDE_SLACK = 5_000;

/**
 * The ceiling on one page's HTML, gzipped, and on the elements it carries,
 * for every exported page. `/api/` is the heaviest, with core's ninety-eight
 * entries, measured at 201,057 bytes gzipped and 13,621 elements with
 * `tools/popup-fold.mjs` folding its type panels out and
 * `tools/token-fold.mjs` folding its fences' token spans. The adapter
 * packages' entries sit on pages of their own, so they add nothing to it.
 *
 * A page that reaches the ceiling calls for a structural change. The
 * page's Markdown source, which the copy-page button reads, takes about
 * 40 kB of the gzipped HTML in the RSC payload, and `/api/` can split by
 * area. The ceiling rose once, from 205,000 to 211,000 bytes gzipped, when
 * `check` became a named export of core with an entry of its own. That entry
 * took `/api/` from 203,155 to 209,375 bytes gzipped and from 13,737 to
 * 14,032 elements.
 */
export const PAGE_BUDGET = { htmlGzip: 211_000, elements: 19_000 };

/**
 * The ceiling on each of IBM Plex Sans Condensed's two latin woff2 files, in
 * bytes. The files are already compressed, so the size is the transfer size.
 * Every page preloads them, since placards sit on every page (site UX spec
 * 12.2). They measure 19,952 bytes (500) and 19,816 bytes (600) in
 * `@fontsource/ibm-plex-sans-condensed` 5.3.0, and the ceiling sits just above.
 */
export const FONT_BUDGET = { perFile: 20_500 };

/** The two files `app/layout.tsx` loads for the condensed family. */
export const CONDENSED_FONTS = [500, 600].map((weight) =>
  join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'node_modules',
    '@fontsource',
    'ibm-plex-sans-condensed',
    'files',
    `ibm-plex-sans-condensed-latin-${weight}-normal.woff2`,
  ),
);

/**
 * The ceilings on the painted ship art (site UX spec 12.2), in bytes, by file
 * under `components/ship-art/`. The files are already compressed, so the size
 * is the transfer size. `tools/ship-art.mjs` writes them, and each ceiling
 * sits at about 1.5 times the measured file. Measured on 2026-10-31, AVIF then
 * WebP: hero 1024 13,074 and 20,156; hero 1536 20,912 and 34,736; hero phone
 * crop 9,428 and 14,672; side 1024 7,170 and 10,438, 1536 11,472 and 16,786,
 * 2048 15,860 and 23,668; unlit cutaway 1024 7,546 and 7,106, 1536 11,877 and
 * 11,214, 2048 16,190 and 16,406 (the rows keep the ceilings of site UX 12.2:
 * AVIF 15, 23 and 30 kB, WebP at 1.5 times).
 */
export const ART_BUDGET = {
  'hero/meridian-hero-1024.avif': 19_600,
  'hero/meridian-hero-1024.webp': 30_200,
  'hero/meridian-hero-1536.avif': 31_400,
  'hero/meridian-hero-1536.webp': 52_100,
  'hero/meridian-hero-phone-720.avif': 14_200,
  'hero/meridian-hero-phone-720.webp': 22_000,
  'cutaway-unlit/meridian-cutaway-unlit-1024.avif': 15_000,
  'cutaway-unlit/meridian-cutaway-unlit-1024.webp': 22_500,
  'cutaway-unlit/meridian-cutaway-unlit-1536.avif': 23_000,
  'cutaway-unlit/meridian-cutaway-unlit-1536.webp': 34_500,
  'cutaway-unlit/meridian-cutaway-unlit-2048.avif': 30_000,
  'cutaway-unlit/meridian-cutaway-unlit-2048.webp': 45_000,
  'side/meridian-side-1024.avif': 10_800,
  'side/meridian-side-1024.webp': 15_700,
  'side/meridian-side-1536.avif': 17_200,
  'side/meridian-side-1536.webp': 25_200,
  'side/meridian-side-2048.avif': 23_800,
  'side/meridian-side-2048.webp': 35_500,
};

/**
 * What a wide screen at twice the pixel density loads of the art: the hero at
 * 1536, the bay's unlit cutaway and the side view at 2048, in AVIF. The sum row
 * holds the three together.
 */
export const ART_SUM = {
  files: [
    'hero/meridian-hero-1536.avif',
    'cutaway-unlit/meridian-cutaway-unlit-2048.avif',
    'side/meridian-side-2048.avif',
  ],
  limit: 90_000,
};

/** Where `tools/ship-art.mjs` writes the art that `ART_BUDGET` holds. */
export const ART_DIR = join(
  import.meta.dirname,
  '..',
  'components',
  'ship-art',
);

export const ISLAND_MARK = 'nexus-console-island';
export const BACKGROUND_MARK = 'meridian-background';
/** The front page's bay controller (site UX spec 12.1). */
export const BAY_MARK = 'nexus-preflight-bay';
/** The core runtime chunk: core, `errors`, devtools' `trace` and `inspect`, and a scene's seed. */
export const RUNTIME_MARK = 'nexus-core-runtime';

/**
 * The bay's light chunk: the deck state, the Pixi view and the cutaway's data
 * layers (site UX spec 12.1, owner ruling OR5). Its row is soft: the owner's
 * rule on soft budgets applies, and a pull request that passes it states the
 * figure.
 */
export const LIGHT_MARK = 'nexus-bay-light';

/**
 * The markers, in the order `classify` tries them. A chunk carries one marker
 * at most, and it counts against that marker's row wherever it loads. A chunk
 * with none is `page` JavaScript.
 */
const MARKS = [
  ['island', ISLAND_MARK],
  ['background', BACKGROUND_MARK],
  ['bay', BAY_MARK],
  ['runtime', RUNTIME_MARK],
  ['light', LIGHT_MARK],
];

/** The rows of the chunks that no page names, each with the marker its chunk carries. */
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

// Next exports its error pages as index.html files that skip the theme chunks,
// so they would shrink the shared set and charge the theme to every page.
const NOT_PAGES = ['_next/', '_not-found/', '404/'];

const TOOL_ROUTES = ['playground/', 'academy/'];

export function scriptsOf(html, basePath) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((src) => src.startsWith(`${basePath}/_next/`))
    .map((src) => src.slice(basePath.length));
}

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

export function checkBudgets(out, { basePath = '' } = {}) {
  const sizes = new Map();
  const kinds = new Map();
  const read = (script) => {
    if (!sizes.has(script)) {
      const text = readFileSync(join(out, script));
      sizes.set(script, gzipSync(text).length);
      const source = text.toString('utf8');
      kinds.set(script, classify(source));
    }
    return { size: sizes.get(script), kind: kinds.get(script) };
  };

  const scripts = new Map(
    pages(out).map((path) => [
      path,
      scriptsOf(readFileSync(join(out, path), 'utf8'), basePath),
    ]),
  );
  const pageScripts = [...scripts.values()].map((list) =>
    list.filter((src) => read(src).kind === 'page'),
  );
  const shared = new Set(
    pageScripts.reduce((common, list) =>
      common.filter((src) => list.includes(src)),
    ),
  );

  const findings = [];
  const rows = [];

  for (const [path, list] of scripts) {
    const tool = TOOL_ROUTES.some((route) => path.startsWith(route));
    const totals = {
      page: 0,
      island: 0,
      background: 0,
      bay: 0,
      runtime: 0,
      light: 0,
    };
    for (const script of list.filter((src) => !shared.has(src))) {
      const { size, kind } = read(script);
      totals[kind] += size;
    }

    const own = tool ? totals.page + totals.island : totals.page;
    const row = tool ? 'tool' : 'content';
    rows.push({
      path,
      row,
      bytes: own,
      island: totals.island,
      background: totals.background,
    });

    if (own > BUDGETS[row]) {
      findings.push(
        `${path}: ${tool ? 'tool-route' : 'content-page'} JavaScript is ${kB(own)} gzipped, over the ${BUDGETS[row] / 1000} kB budget. Load the code on interaction or move it into the console island.`,
      );
    }
    if (!tool && totals.island > BUDGETS.island) {
      findings.push(
        `${path}: the console island is ${kB(totals.island)} gzipped, over the 35 kB budget. Move work out of the island or load it after Run.`,
      );
    }
    if (totals.bay > BUDGETS.bay) {
      findings.push(
        `${path}: the bay controller is ${kB(totals.bay)} gzipped, over the ${BUDGETS.bay / 1000} kB budget. Move work into the run chunk or load it after the first control.`,
      );
    }
    if (totals.runtime > BUDGETS.runtime) {
      findings.push(
        `${path}: the core runtime chunk is ${kB(totals.runtime)} gzipped, over the ${BUDGETS.runtime / 1000} kB budget. Import a narrower entry of core, errors or devtools, or raise BUDGETS.runtime with the new measurement.`,
      );
    }
    if (totals.light > BUDGETS.light) {
      findings.push(
        `${path}: the bay light chunk is ${kB(totals.light)} gzipped, over the ${BUDGETS.light / 1000} kB budget.`,
      );
    }
    if (totals.background > BUDGETS.background) {
      findings.push(
        `${path}: the background module is ${kB(totals.background)} gzipped, over the 8 kB budget. Shrink internal/meridian-ui/src/background.`,
      );
    }
  }

  return { findings, rows };
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
 * which the light fetches. The AVIF and WebP art that other modules emit as
 * URLs is shown by a `<picture>` and counts against no chunk row.
 */
const MEDIA = /\/_next\/static\/media\/([^"'\s)]+\.png)/g;

/**
 * Holds the chunks that a page loads with `import()` to their rows. No page's
 * HTML names them, so `checkBudgets` never sees them: the bay controller, the
 * run chunk and the light chunk load when the bay nears the viewport. A row
 * is the group of the `import()` that loads the chunk carrying the row's
 * marker: that chunk, the unmarked chunks that group lists with it (core in a
 * shared chunk, Pixi in another) and the media its chunks emit. A chunk that
 * two groups share counts once in each, and a row with no marked chunk fails,
 * since a minifier that dropped the marker would otherwise hide the group.
 */
export function checkMarkedChunks(out) {
  const root = join(out, '_next', 'static');
  let files = [];
  try {
    files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => join(entry.parentPath, entry.name));
  } catch {
    return {
      findings: [
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
  const findings = [];
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
    rows.push({ row: lazy.row, chunks, gzip, media: mediaBytes });
    if (marked.length === 0)
      findings.push(
        `No chunk under _next/static carries the ${lazy.mark} marker. The bay must import its marker function after the import() so that a minifier keeps the string.`,
      );
    else if (gzip > BUDGETS[lazy.row])
      findings.push(
        `The ${lazy.label} chunks are ${kB(gzip)} gzipped (${chunks.map((chunk) => chunk.file).join(', ')}${mediaBytes > 0 ? `, and ${kB(mediaBytes)} of media` : ''}), over the ${BUDGETS[lazy.row] / 1000} kB budget.`,
      );
  }
  return { findings, rows };
}

/** Every script and stylesheet a page's HTML loads, base path stripped. */
export function assetsOf(html, basePath) {
  const local = (url) =>
    url.startsWith(`${basePath}/_next/`) ? [url.slice(basePath.length)] : [];
  return [
    ...new Set([
      ...[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)].flatMap(
        (match) => local(match[1]),
      ),
      ...[...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/g)].flatMap(
        (match) => local(match[1]),
      ),
    ]),
  ];
}

/** Holds the guide page's total to `GUIDE_BUDGET`, both ways. */
export function checkGuideTotal(out, { basePath = '' } = {}) {
  const html = readFileSync(join(out, GUIDE_PAGE), 'utf8');
  const total = assetsOf(html, basePath).reduce(
    (sum, asset) => {
      const text = readFileSync(join(out, asset));
      return {
        raw: sum.raw + text.length,
        gzip: sum.gzip + gzipSync(text).length,
      };
    },
    { raw: 0, gzip: 0 },
  );

  const findings = [];
  if (total.raw > GUIDE_BUDGET.raw || total.gzip > GUIDE_BUDGET.gzip)
    findings.push(
      `${GUIDE_PAGE}: the page loads ${kB(total.raw)} raw and ${kB(total.gzip)} gzipped of scripts and styles, over the ${GUIDE_BUDGET.raw / 1000} kB raw or ${GUIDE_BUDGET.gzip / 1000} kB gzipped ratchet. A component a reference page reaches ships with every guide; load it with import() on use, or raise GUIDE_BUDGET with the new measurement and the reason.`,
    );
  else if (GUIDE_BUDGET.gzip - total.gzip > GUIDE_SLACK)
    findings.push(
      `${GUIDE_PAGE}: the page loads ${kB(total.gzip)} gzipped, more than ${GUIDE_SLACK / 1000} kB under the ${GUIDE_BUDGET.gzip / 1000} kB ratchet. Lower GUIDE_BUDGET to ${total.raw} raw and ${total.gzip} gzipped.`,
    );

  return { findings, total };
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

/** Holds every page to `PAGE_BUDGET`. */
export function checkPages(out) {
  const rows = pages(out).map((path) => {
    const html = readFileSync(join(out, path));
    return {
      path,
      htmlGzip: gzipSync(html).length,
      elements: elementsOf(html.toString('utf8')),
    };
  });
  const findings = rows
    .filter(
      (row) =>
        row.htmlGzip > PAGE_BUDGET.htmlGzip ||
        row.elements > PAGE_BUDGET.elements,
    )
    .map(
      (row) =>
        `${row.path}: the page's HTML is ${kB(row.htmlGzip)} gzipped with ${row.elements} elements, over the ${PAGE_BUDGET.htmlGzip / 1000} kB or ${PAGE_BUDGET.elements} element budget. Move content out of the HTML, as tools/popup-fold.mjs moves the type panels, or raise PAGE_BUDGET with the new measurement and the reason.`,
    );
  return { findings, rows };
}

/** Holds every behaviour sidecar under `out/behaviour` to `BEHAVIOUR_BUDGET`. */
export function checkBehaviour(out) {
  const root = join(out, 'behaviour');
  let entries;
  try {
    entries = readdirSync(root, { recursive: true, withFileTypes: true });
  } catch {
    return {
      findings: [
        `${relative(out, root)} does not exist. Run \`npx nx run @nexusdi/docs:behaviour-data\` before the build.`,
      ],
      rows: [],
    };
  }

  const rows = entries
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

  const findings = rows
    .filter(
      (row) =>
        row.raw > BEHAVIOUR_BUDGET.raw || row.gzip > BEHAVIOUR_BUDGET.gzip,
    )
    .map(
      (row) =>
        `${row.path}: the behaviour sidecar is ${kB(row.raw)} raw and ${kB(row.gzip)} gzipped, over the ${BEHAVIOUR_BUDGET.raw / 1000} kB raw or ${BEHAVIOUR_BUDGET.gzip / 1000} kB gzipped budget. Either raise BEHAVIOUR_BUDGET in the same pull request with the new measurement, or shrink the markup in tools/behaviour-data.mjs (for example, share the popups once per library).`,
    );

  return { findings, rows };
}

/**
 * The files `next` copied into `out/_next/static/media`, as bytes, that pass
 * `keep`. It copies a static import there under a hashed name, so a check finds
 * each source file by its bytes. No media directory means no copy.
 */
function mediaCopies(out, keep = () => true) {
  const media = join(out, '_next', 'static', 'media');
  let shipped = [];
  try {
    shipped = readdirSync(media).filter(keep);
  } catch {
    // No media directory: every source reports as not shipped.
  }
  return {
    where: relative(out, media) || media,
    copies: shipped.map((name) => readFileSync(join(media, name))),
  };
}

/**
 * One row for a source file, and its findings: no identical copy in the
 * export, or more bytes than `limit`. `missing` and `over` finish the two
 * messages with the fix.
 */
function holdFile({ name, bytes, limit, found, where, missing, over }) {
  const findings = [];
  if (!found)
    findings.push(`${name}: no identical copy under ${where}. ${missing}`);
  if (bytes.length > limit)
    findings.push(
      `${name}: ${kB(bytes.length)}, over the ${kB(limit)} budget. ${over}`,
    );
  return {
    row: { file: name, bytes: bytes.length, shipped: Boolean(found) },
    findings,
  };
}

/**
 * Measures the condensed family's two woff2 files and holds each to
 * `FONT_BUDGET`. A source with no identical copy in the export was not shipped.
 */
export function checkFonts(out, { sources = CONDENSED_FONTS } = {}) {
  const { where, copies } = mediaCopies(out, (name) => name.endsWith('.woff2'));
  const rows = [];
  const findings = [];
  for (const source of sources) {
    const bytes = readFileSync(source);
    const held = holdFile({
      name: source.split(sep).pop(),
      bytes,
      limit: FONT_BUDGET.perFile,
      found: copies.find((copy) => copy.equals(bytes)),
      where,
      missing:
        'app/layout.tsx must load the condensed family through next/font/local.',
      over: 'Raise FONT_BUDGET with the new measurement and the reason.',
    });
    rows.push(held.row);
    findings.push(...held.findings);
  }
  return { findings, rows };
}

/**
 * Holds each ship art file to its row of `ART_BUDGET`, and the three files of
 * `ART_SUM` to their sum. A source with no identical copy in the export was
 * not shipped.
 */
export function checkArt(
  out,
  { dir = ART_DIR, budget = ART_BUDGET, sum = ART_SUM } = {},
) {
  const { where, copies } = mediaCopies(out);
  const rows = [];
  const findings = [];
  for (const [name, limit] of Object.entries(budget)) {
    const bytes = readFileSync(join(dir, name));
    const held = holdFile({
      name,
      bytes,
      limit,
      found: copies.find((copy) => copy.equals(bytes)),
      where,
      missing: 'A component must import it statically.',
      over: 'Run tools/ship-art.mjs with a lower quality, or raise ART_BUDGET with the new measurement and the reason.',
    });
    rows.push(held.row);
    findings.push(...held.findings);
  }
  const total = sum.files.reduce(
    (all, name) => all + readFileSync(join(dir, name)).length,
    0,
  );
  rows.push({ file: 'sum', bytes: total, shipped: true });
  if (total > sum.limit)
    findings.push(
      `The hero, cutaway and side art load ${kB(total)} of AVIF together, over the ${kB(sum.limit)} budget. Lower the quality in tools/ship-art.mjs, or raise ART_SUM with the new measurement and the reason.`,
    );
  return { findings, rows };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = join(import.meta.dirname, '..', 'out');
  const { findings, rows } = checkBudgets(out, {
    basePath: process.env.DOCS_BASE_PATH ?? '',
  });
  for (const row of rows) {
    console.log(
      `${row.path}: ${row.row} ${kB(row.bytes)}, island ${kB(row.island)}, background ${kB(row.background)}`,
    );
  }
  const marked = checkMarkedChunks(out);
  for (const row of marked.rows)
    console.log(
      `${LAZY_ROWS.find((lazy) => lazy.row === row.row)?.mark}: ${kB(row.gzip)} gzipped in ${row.chunks.length} chunk${row.chunks.length === 1 ? '' : 's'}, budget ${BUDGETS[row.row] / 1000} kB`,
    );
  findings.push(...marked.findings);
  const guide = checkGuideTotal(out, {
    basePath: process.env.DOCS_BASE_PATH ?? '',
  });
  console.log(
    `${GUIDE_PAGE}: ${kB(guide.total.raw)} raw, ${kB(guide.total.gzip)} gzipped of scripts and styles`,
  );
  findings.push(...guide.findings);
  const sized = checkPages(out);
  const [heaviest] = [...sized.rows].sort((a, b) => b.htmlGzip - a.htmlGzip);
  if (heaviest)
    console.log(
      `the heaviest page is ${heaviest.path}: ${kB(heaviest.htmlGzip)} of HTML gzipped, ${heaviest.elements} elements`,
    );
  findings.push(...sized.findings);
  const behaviour = checkBehaviour(out);
  const [largest] = behaviour.rows;
  if (largest)
    console.log(
      `${behaviour.rows.length} behaviour sidecars; the largest is ${largest.path} at ${kB(largest.raw)} raw, ${kB(largest.gzip)} gzipped`,
    );
  findings.push(...behaviour.findings);
  const fonts = checkFonts(out);
  for (const row of fonts.rows)
    console.log(
      `${row.file}: ${kB(row.bytes)}${row.shipped ? '' : ', not in the export'}`,
    );
  findings.push(...fonts.findings);
  const art = checkArt(out);
  for (const row of art.rows)
    console.log(
      `${row.file}: ${kB(row.bytes)}${row.shipped ? '' : ', not in the export'}`,
    );
  findings.push(...art.findings);
  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exit(1);
  }
}
