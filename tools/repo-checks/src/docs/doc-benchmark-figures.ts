import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DOCS } from './paths';
import { isPreFinalPost, proseLines, type DocsPage } from './site';

/**
 * A number followed by a size or time unit, or by `%` (docs spec section
 * 14.3). Prose states such a figure through a benchmark component.
 */
export const FIGURE =
  /\d(?:[\d,.]*\d)?\s?(?:%|(?:B|bytes|kB|KB|MB|ns|µs|ms|s)(?![\p{L}\p{N}]))/u;

const TAG =
  /<(Figure|PerformanceTable|ToolchainGrid|ProbeTable|MeasuredWith)\b([^>]*?)\/?>/g;
const FENCE = /^\s*(`{3,})/;

/** The two docs modules the guard reads, as the build reads them. */
export interface BenchmarkModules {
  data: { timings: Record<string, unknown> };
  lookup: (data: unknown, path: string, run?: string) => unknown;
}

/** `apps/docs/tools/benchmark-*.mjs`, imported by path so no project depends on the app. */
export async function loadBenchmarks(): Promise<BenchmarkModules> {
  const tool = (name: string) => pathToFileURL(join(DOCS, 'tools', name)).href;
  const { readBenchmarkData } = (await import(tool('benchmark-data.mjs'))) as {
    readBenchmarkData: () => BenchmarkModules['data'];
  };
  const { lookup } = (await import(tool('benchmark-path.mjs'))) as {
    lookup: BenchmarkModules['lookup'];
  };
  return { data: readBenchmarkData(), lookup };
}

/**
 * The body with every fenced line and code span blanked, so a tag named in
 * code is no tag and each line keeps its number.
 */
function outsideFences(body: string): string[] {
  let open: string | null = null;
  return body.split('\n').map((line) => {
    const marker = FENCE.exec(line)?.[1];
    if (open === null && marker !== undefined) {
      open = marker;
      return '';
    }
    if (open !== null) {
      if (marker !== undefined && marker.startsWith(open)) open = null;
      return '';
    }
    return line.replace(/`[^`]*`/g, '');
  });
}

/**
 * `doc-benchmark-figures`: no size or time figure in prose, a table cell or
 * the description outside a component, and every `<Figure of>` path and
 * every `run` names data the results hold.
 */
export function checkBenchmarkFigures(input: {
  pages: DocsPage[];
  benchmarks: BenchmarkModules;
}): string[] {
  const { pages, benchmarks } = input;
  const findings: string[] = [];
  const fix =
    'State it with <Figure of="…" /> from the benchmark results (docs spec section 4.6).';

  for (const page of pages) {
    if (isPreFinalPost(page)) continue;
    const offset =
      page.source.split('\n').length - page.body.split('\n').length;

    const description = page.frontmatter.description;
    const inDescription =
      typeof description === 'string' ? FIGURE.exec(description) : null;
    if (inDescription !== null) {
      findings.push(
        `${page.file}: the description states '${inDescription[0]}'. A description renders no component, so it names no figure.`,
      );
    }

    for (const { line, text } of proseLines(page)) {
      const found = FIGURE.exec(text);
      if (found !== null)
        findings.push(`${page.file}:${line}: '${found[0]}' in prose. ${fix}`);
    }

    outsideFences(page.body).forEach((text, index) => {
      const line = index + 1 + offset;
      for (const [tag, name, attributes = ''] of text.matchAll(TAG)) {
        const of = /\bof="([^"]*)"/.exec(attributes)?.[1];
        const run = /\brun="([^"]*)"/.exec(attributes)?.[1];
        if (name === 'Figure' && of === undefined) {
          findings.push(
            `${page.file}:${line}: ${tag} has no of="…". Give the path as a string, so the guard can check it.`,
          );
          continue;
        }
        if (of !== undefined) {
          try {
            benchmarks.lookup(benchmarks.data, of, run);
          } catch (error) {
            findings.push(
              `${page.file}:${line}: <Figure of="${of}">: ${(error as Error).message}`,
            );
          }
        } else if (run !== undefined && !(run in benchmarks.data.timings)) {
          findings.push(
            `${page.file}:${line}: <${name} run="${run}">: benchmarks/results/timings/ holds no such file.`,
          );
        }
      }
    });
  }

  return findings.sort();
}
