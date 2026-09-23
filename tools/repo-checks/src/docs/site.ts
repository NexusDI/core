import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';
import { parse } from 'yaml';

/**
 * The docs content tree as the guards read it.
 *
 * Textual, the way the libraries guards read it: a fence, a heading and a JSX
 * tag are lines, and every rule here asks a question about lines. Each guard
 * takes the pages this module returns, so a rule runs against a fixture tree
 * and against `apps/docs/content` through the same code.
 */

export const EXEMPTION_TAGS = [
  'signature',
  'no-run',
  'anti-example',
  'fails-type-check',
  'elided',
] as const;

export const SHELL_LANGS = ['sh', 'bash', 'shell', 'console', 'zsh'] as const;

export interface DocsFence {
  lang: string;
  meta: string;
  tags: string[];
  body: string;
  line: number;
  section: string | null;
}

export interface DocsHeading {
  depth: number;
  text: string;
  slug: string;
  line: number;
}

export interface DocsSection {
  heading: DocsHeading;
  body: string;
  fences: DocsFence[];
}

export interface DocsPage {
  slug: string;
  file: string;
  source: string;
  body: string;
  frontmatter: Record<string, unknown>;
  kind: string | undefined;
  headings: DocsHeading[];
  fences: DocsFence[];
  sections: DocsSection[];
}

export interface MetaEntry {
  key: string;
  page: boolean;
  value: unknown;
}

const FENCE = /^(\s*)(`{3,})(.*)$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

/** The anchor Nextra gives a heading: lower case, code marks and punctuation gone. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** The text with every fenced block removed. */
export function stripFences(text: string): string {
  const out: string[] = [];
  let open: string | null = null;

  for (const line of text.split('\n')) {
    const marker = FENCE.exec(line);
    if (marker && open === null) {
      open = marker[2] as string;
      continue;
    }
    if (open !== null) {
      if (marker && (marker[2] as string).startsWith(open)) open = null;
      continue;
    }
    out.push(line);
  }

  return out.join('\n');
}

function contentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return contentFiles(path);
      return /\.mdx?$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

function splitFrontmatter(source: string): {
  frontmatter: Record<string, unknown>;
  body: string;
  offset: number;
} {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) return { frontmatter: {}, body: source, offset: 0 };

  const parsed = parse(match[1] ?? '') as unknown;

  return {
    frontmatter:
      parsed !== null && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {},
    body: source.slice(match[0].length),
    offset: match[0].split('\n').length - 1,
  };
}

/** One page, parsed. `file` is what a finding prints. */
export function parsePage(
  file: string,
  slug: string,
  source: string,
): DocsPage {
  const { frontmatter, body, offset } = splitFrontmatter(source);
  const headings: DocsHeading[] = [];
  const fences: DocsFence[] = [];
  const sections: DocsSection[] = [];
  let section: DocsSection | null = null;
  let sectionLines: string[] = [];
  let open: {
    ticks: string;
    lang: string;
    meta: string;
    line: number;
    body: string[];
  } | null = null;

  const closeSection = (): void => {
    if (section === null) return;
    section.body = sectionLines.join('\n');
    sections.push(section);
  };

  body.split('\n').forEach((text, index) => {
    const line = index + 1 + offset;
    const marker = FENCE.exec(text);

    if (open !== null) {
      if (
        marker &&
        (marker[2] as string).startsWith(open.ticks) &&
        (marker[3] as string).trim() === ''
      ) {
        const words = open.meta.split(/\s+/).filter(Boolean);
        const fence: DocsFence = {
          lang: open.lang,
          meta: open.meta,
          tags: words.filter((word) =>
            (EXEMPTION_TAGS as readonly string[]).includes(word),
          ),
          body: open.body.join('\n'),
          line: open.line,
          section: section?.heading.text ?? null,
        };
        fences.push(fence);
        section?.fences.push(fence);
        open = null;
      } else {
        open.body.push(text);
      }
      sectionLines.push(text);
      return;
    }

    if (marker) {
      const [lang = '', ...rest] = (marker[3] as string).trim().split(/\s+/);
      open = {
        ticks: marker[2] as string,
        lang,
        meta: rest.join(' '),
        line,
        body: [],
      };
      sectionLines.push(text);
      return;
    }

    const heading = HEADING.exec(text);
    if (heading) {
      const found: DocsHeading = {
        depth: (heading[1] as string).length,
        text: heading[2] as string,
        slug: slugify(heading[2] as string),
        line,
      };
      headings.push(found);

      if (found.depth === 2) {
        closeSection();
        section = { heading: found, body: '', fences: [] };
        sectionLines = [];
        return;
      }
    }

    sectionLines.push(text);
  });

  closeSection();

  return {
    slug,
    file,
    source,
    body,
    frontmatter,
    kind: typeof frontmatter.kind === 'string' ? frontmatter.kind : undefined,
    headings,
    fences,
    sections,
  };
}

/**
 * Every `.mdx` and `.md` page under `contentDir`.
 *
 * `transform` runs on the source before it parses. The live guards pass the
 * region loader's `expandRegions` there, so a fence that cites a region is read
 * with the code the build puts in it.
 */
export function readSite(
  contentDir: string,
  options: { transform?: (source: string, file: string) => string } = {},
): DocsPage[] {
  return contentFiles(contentDir).map((path) => {
    const raw = readFileSync(path, 'utf8');
    const source = options.transform ? options.transform(raw, path) : raw;
    const slug = relative(contentDir, path)
      .split(sep)
      .join('/')
      .replace(/\.mdx?$/, '');

    return parsePage(relative(workspaceRoot, path), slug, source);
  });
}

/**
 * Every `_meta.ts` entry, in order, with a folder's entries after its own key.
 *
 * A separator and an entry with an `href` are navigation and name no page.
 */
export async function readMeta(
  contentDir: string,
  prefix = '',
): Promise<MetaEntry[]> {
  const file = join(contentDir, '_meta.ts');
  if (!existsSync(file)) return [];

  const module_ = (await import(pathToFileURL(file).href)) as {
    default: Record<string, unknown>;
  };
  const entries: MetaEntry[] = [];

  for (const [key, value] of Object.entries(module_.default)) {
    const object =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : null;
    const page = !(
      object !== null &&
      (object.type === 'separator' || typeof object.href === 'string')
    );

    entries.push({ key: `${prefix}${key}`, page, value });

    if (page && existsSync(join(contentDir, key, '_meta.ts'))) {
      entries.push(
        ...(await readMeta(join(contentDir, key), `${prefix}${key}/`)),
      );
    }
  }

  return entries;
}

/** The `_meta.ts` keys that name a page or a folder, in order. */
export async function readMetaKeys(contentDir: string): Promise<string[]> {
  return (await readMeta(contentDir))
    .filter((entry) => entry.page)
    .map((entry) => entry.key);
}

/**
 * The page's prose lines with their source line numbers.
 *
 * Fences, imports, comments, JSX tags and code spans go. The text inside a
 * JSX element stays, because a notice's sentence is prose a reader reads.
 */
export function proseLines(page: DocsPage): { line: number; text: string }[] {
  const offset = page.source.split('\n').length - page.body.split('\n').length;
  const out: { line: number; text: string }[] = [];
  let open: string | null = null;

  page.body.split('\n').forEach((raw, index) => {
    const marker = FENCE.exec(raw);
    if (marker && open === null) {
      open = marker[2] as string;
      return;
    }
    if (open !== null) {
      if (marker && (marker[2] as string).startsWith(open)) open = null;
      return;
    }
    if (/^\s*(import|export)\s/.test(raw)) return;

    const text = raw
      .replace(/<!--.*?-->/g, '')
      .replace(/\{\/\*.*?\*\/\}/g, '')
      .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/\s+/g, ' ')
      .trim();

    if (text !== '') out.push({ line: index + 1 + offset, text });
  });

  return out;
}

/** The prose of a page as one string. */
export function proseOf(page: DocsPage): string {
  return proseLines(page)
    .map((line) => line.text)
    .join('\n');
}

/** Semver order over `major.minor.patch` with an optional prerelease. */
export function compareVersions(a: string, b: string): number {
  const split = (version: string): [number[], string | null] => {
    const [core = '', pre] = version.split('-', 2);
    return [core.split('.').map(Number), pre ?? null];
  };
  const [coreA, preA] = split(a);
  const [coreB, preB] = split(b);

  for (let at = 0; at < 3; at += 1) {
    const delta = (coreA[at] ?? 0) - (coreB[at] ?? 0);
    if (delta !== 0) return delta;
  }
  if (preA === preB) return 0;
  if (preA === null) return 1;
  if (preB === null) return -1;
  return preA.localeCompare(preB, 'en', { numeric: true });
}

/**
 * A post that describes a version below 0.4.0.
 *
 * Amendment A2: such a post keeps its original text, 0.3 APIs included, so the
 * fence, domain, export and refused-word guards skip it.
 */
export function isPreFinalPost(page: DocsPage): boolean {
  const version = page.frontmatter.version;
  return (
    page.kind === 'post' &&
    typeof version === 'string' &&
    compareVersions(version, '0.4.0') < 0
  );
}
