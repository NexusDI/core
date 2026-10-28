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
 * Issue #235 tracks sharing the popups once per library in
 * `tools/behaviour-data.mjs`; the ceilings drop again when it lands.
 */
export const BEHAVIOUR_BUDGET = { raw: 1_550_000, gzip: 65_000 };

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
 * Measured at 978,859 bytes raw and 297,242 gzipped. A guide carries
 * `components/twoslash/TypeCards.tsx`, which every page's component map
 * holds, and not the popover it loads: that comes with `import()` on a page
 * with a `twoslash` fence.
 */
export const GUIDE_PAGE = 'scopes/index.html';
export const GUIDE_BUDGET = { raw: 981_000, gzip: 299_000 };
export const GUIDE_SLACK = 5_000;

/**
 * The ceiling on one page's HTML, gzipped, and on the elements it carries,
 * for every exported page. `/api/` is the heaviest, with core's ninety-one
 * entries, measured at 185,619 bytes gzipped and 15,921 elements with
 * `tools/popup-fold.mjs` folding its type panels out. The adapter packages'
 * entries sit on pages of their own, so they add nothing to it.
 *
 * A page that reaches the ceiling calls for a structural change: fold the
 * example fences' token spans as the type panels were folded, or split
 * `/api/` by area. The ceiling itself stays where it is.
 */
export const PAGE_BUDGET = { htmlGzip: 205_000, elements: 19_000 };

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
  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exit(1);
  }
}
