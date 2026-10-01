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
  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exit(1);
  }
}
