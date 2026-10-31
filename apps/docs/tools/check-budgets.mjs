import { readFileSync, readdirSync } from 'node:fs';
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
 * Measured at 1008.6 kB raw and 304.7 kB gzipped, so the ceilings stay at 1009 kB and
 * 305 kB. The front page adds nothing to the total: `Styles.tsx` writes its
 * stylesheet, with the schematic rules of `@nexusdi/meridian-ui/schematic.css`,
 * into the front page's HTML, and `CopyIsland.tsx` loads its button with
 * `import()`. A stylesheet or a client component that any page imports reaches
 * the route's entry and every guide.
 *
 * Measured earlier at 1008.1 kB raw and 304.6 kB gzipped. The docs chrome (site spec
 * section 13) added the chrome, code and search stylesheets and the search
 * component, so the ceilings rose from 984 kB and 299 kB to 1009 kB and 305 kB.
 *
 * Measured earlier at 982,514 bytes raw and 298,476 gzipped. The Meridian
 * stylesheet carries the Terminal, Button, Status, Alert and HoloLabel
 * classes, so the raw ceiling sat at 984,000. A guide carries
 * `components/twoslash/TypeCards.tsx`, which every page's component map
 * holds, and not the popover it loads: that comes with `import()` on a page
 * with a `twoslash` fence.
 */
export const GUIDE_PAGE = 'scopes/index.html';
export const GUIDE_BUDGET = { raw: 1_009_000, gzip: 305_000 };
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
 * area. The ceiling itself stays where it is.
 */
export const PAGE_BUDGET = { htmlGzip: 205_000, elements: 19_000 };

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
 * crop 9,428 and 14,672; cutaway 1024 10,239 and 11,056, 1536 15,805 and 16,204,
 * 2048 21,616 and 24,006; side 1024 7,170 and 10,438, 1536 11,472 and 16,786,
 * 2048 15,860 and 23,668; unlit cutaway 1024 7,609 and 7,188, 1536 12,069 and
 * 11,436, 2048 17,105 and 16,596 (the rows keep the ceilings of site UX 12.2:
 * AVIF 15, 23 and 30 kB, WebP at 1.5 times).
 */
export const ART_BUDGET = {
  'hero/meridian-hero-1024.avif': 19_600,
  'hero/meridian-hero-1024.webp': 30_200,
  'hero/meridian-hero-1536.avif': 31_400,
  'hero/meridian-hero-1536.webp': 52_100,
  'hero/meridian-hero-phone-720.avif': 14_200,
  'hero/meridian-hero-phone-720.webp': 22_000,
  'cutaway/meridian-cutaway-1024.avif': 13_800,
  'cutaway/meridian-cutaway-1024.webp': 14_200,
  'cutaway/meridian-cutaway-1536.avif': 21_000,
  'cutaway/meridian-cutaway-1536.webp': 21_500,
  'cutaway/meridian-cutaway-2048.avif': 28_500,
  'cutaway/meridian-cutaway-2048.webp': 29_800,
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
      kinds.set(
        script,
        source.includes(ISLAND_MARK)
          ? 'island'
          : source.includes(BACKGROUND_MARK)
            ? 'background'
            : 'page',
      );
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
    const totals = { page: 0, island: 0, background: 0 };
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
    if (totals.background > BUDGETS.background) {
      findings.push(
        `${path}: the background module is ${kB(totals.background)} gzipped, over the 8 kB budget. Shrink internal/meridian-ui/src/background.`,
      );
    }
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
 * Measures the condensed family's two woff2 files and holds each to
 * `FONT_BUDGET`. `next/font` copies a font into `out/_next/static/media` under
 * a hashed name, so the check finds each source file there by its bytes. A
 * source with no identical copy in the export was not shipped.
 */
export function checkFonts(out, { sources = CONDENSED_FONTS } = {}) {
  const media = join(out, '_next', 'static', 'media');
  let shipped = [];
  try {
    shipped = readdirSync(media).filter((name) => name.endsWith('.woff2'));
  } catch {
    // No media directory: every source reports as not shipped below.
  }
  const copies = shipped.map((name) => readFileSync(join(media, name)));

  const rows = [];
  const findings = [];
  for (const source of sources) {
    const name = source.split(sep).pop();
    const bytes = readFileSync(source);
    const found = copies.find((copy) => copy.equals(bytes));
    rows.push({ file: name, bytes: bytes.length, shipped: Boolean(found) });
    if (!found)
      findings.push(
        `${name}: no identical copy under ${relative(out, media) || media}. app/layout.tsx must load the condensed family through next/font/local.`,
      );
    if (bytes.length > FONT_BUDGET.perFile)
      findings.push(
        `${name}: ${kB(bytes.length)}, over the ${FONT_BUDGET.perFile / 1000} kB budget for a condensed woff2 file. Raise FONT_BUDGET with the new measurement and the reason.`,
      );
  }
  return { findings, rows };
}

/**
 * Holds each ship art file to its row of `ART_BUDGET`, and the three files of
 * `ART_SUM` to their sum. `next` copies a static import into
 * `out/_next/static/media` under a hashed name, so the check finds each source
 * file there by its bytes, as `checkFonts` does. A source with no identical
 * copy in the export was not shipped.
 */
export function checkArt(
  out,
  { dir = ART_DIR, budget = ART_BUDGET, sum = ART_SUM } = {},
) {
  const media = join(out, '_next', 'static', 'media');
  let shipped = [];
  try {
    shipped = readdirSync(media);
  } catch {
    // No media directory: every source reports as not shipped below.
  }
  const copies = shipped.map((name) => readFileSync(join(media, name)));

  const rows = [];
  const findings = [];
  for (const [name, limit] of Object.entries(budget)) {
    const bytes = readFileSync(join(dir, name));
    const found = copies.find((copy) => copy.equals(bytes));
    rows.push({ file: name, bytes: bytes.length, shipped: Boolean(found) });
    if (!found)
      findings.push(
        `${name}: no identical copy under ${relative(out, media) || media}. A component must import it statically.`,
      );
    if (bytes.length > limit)
      findings.push(
        `${name}: ${kB(bytes.length)}, over the ${kB(limit)} budget. Run tools/ship-art.mjs with a lower quality, or raise ART_BUDGET with the new measurement and the reason.`,
      );
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
