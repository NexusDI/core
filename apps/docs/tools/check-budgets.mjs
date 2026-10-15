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
 */
export const BEHAVIOUR_BUDGET = { raw: 1_400_000, gzip: 60_000 };

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
