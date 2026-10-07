import { repoUrlFor } from '@nexusdi/release';

import { interfaceFirstHits } from './docs/doc-interface-first.js';
import {
  DOCS_CONTENT,
  DOCS_SITE,
  HEADINGS,
  LIMITS,
  LOGO,
  PACKAGES,
  SPECS,
  type Kind,
  type Package,
} from './npm-readmes-data.js';

/**
 * The npm README standard (0.4) as rules over one README's text. The IO is
 * passed in, so each rule is tested against fixtures as well as against the
 * READMEs in libs/.
 *
 * A README runs context, concept, detail (docs/documentation-style-guide.md):
 * a title, the badges and a one-line tagline, a lead-in on the problem, one
 * or more H2s of the README's own on what the package is, then the example,
 * the install line, the documentation links and the licence.
 *
 * Prose is the README with these removed: fenced blocks, inline code, HTML
 * comments, HTML tag attributes (alt text included), images and link
 * targets. Link text and table cells stay. Every removal keeps the line
 * breaks, so a prose hit reports the README's own line number.
 */

export type Rule =
  | 'headings'
  | 'length'
  | 'hero'
  | 'badges'
  | 'tagline'
  | 'lead-in'
  | 'rc-notice'
  | 'install'
  | 'documentation'
  | 'repo-urls'
  | 'images'
  | 'license'
  | 'doctests'
  | 'interface-first'
  | 'packages'
  | 'banned'
  | 'banned-prose';

export interface Fault {
  readonly rule: Rule;
  readonly message: string;
}

export interface ReadmeInput {
  /** The package the README belongs to, or `root` for the repo README. */
  readonly name: Package | 'root';
  readonly source: string;
  /** The package's package.json version (core's for the root README). */
  readonly version: string;
  /** The package's `@nexusdi/*` peers, unscoped, in package.json order. */
  readonly peers: readonly string[];
  /** The package's `docs/*.md` region files. */
  readonly docs: readonly { readonly file: string; readonly source: string }[];
  /** core's README, whose doctests the root README copies. Needed for `root`. */
  readonly core?: string;
  /** Whether a path relative to the repository root exists. */
  readonly exists: (path: string) => boolean;
}

interface Pattern {
  readonly name: string;
  readonly pattern: RegExp;
}

/** Checked against the raw file. */
export const BANNED: readonly Pattern[] = [
  { name: 'native', pattern: /\bnative\b/i },
  { name: 'reflect-metadata', pattern: /reflect-metadata/i },
  { name: 'error code', pattern: /\bNEXUS_[A-Z_]+/ },
  { name: 'emoji', pattern: /\p{Extended_Pictographic}/u },
  { name: 'size figure', pattern: /\b\d+(\.\d+)?\s?KB\b/i },
  { name: 'lightweight', pattern: /\blightweight\b/i },
];

/** Checked against prose only. */
export const BANNED_PROSE: readonly Pattern[] = [
  { name: 'dash', pattern: /[—–]/ },
  { name: 'not X but Y', pattern: /\bnot\b[^.!?\n]{0,60}\bbut\b/i },
  { name: 'rather than', pattern: /\b(rather than|instead of)\b/i },
  {
    name: 'filler',
    pattern:
      /\b(worth (noting|flagging|mentioning)|importantly|notably|the thing is)\b/i,
  },
  {
    name: 'metaphor verb',
    pattern: /\b(bites?|lands?|buys|costs?|earns?|pays|survives?|ships)\b/i,
  },
];

const LICENSE_LINK = 'https://github.com/NexusDI/core/blob/main/LICENSE';
/** The release candidate notice, in the words core's and the root's Installation use. */
const RC_NOTICE =
  /^> (\d+\.\d+) is (?:currently )?(?:in )?(?:a )?release candidate\b/i;
const DOCTEST = 'ts @import.meta.vitest';
const CLAIM = '// -> ';
const BOLD_LINE = /^\*\*[^*]+\*\*$/;
const HERO_TAGLINE = /^\s*<p>(.+)<\/p>\s*$/;

interface Fence {
  /** 0-based line of the opening fence. */
  readonly start: number;
  /** 0-based line of the closing fence. */
  readonly end: number;
  readonly info: string;
  readonly body: readonly string[];
}

interface Parsed {
  readonly lines: readonly string[];
  readonly fences: readonly Fence[];
  /** True for each line that sits inside a fence, the fences included. */
  readonly fenced: readonly boolean[];
}

function parse(source: string): Parsed {
  const lines = source.split('\n');
  const fences: Fence[] = [];
  const fenced = lines.map(() => false);
  let open: { start: number; marker: string; info: string } | null = null;
  lines.forEach((line, i) => {
    if (open === null) {
      const m = /^(`{3,}|~{3,})(.*)$/.exec(line);
      if (m)
        open = { start: i, marker: m[1] as string, info: (m[2] ?? '').trim() };
    } else if (line.trim() === open.marker) {
      fences.push({
        start: open.start,
        end: i,
        info: open.info,
        body: lines.slice(open.start + 1, i),
      });
      for (let j = open.start; j <= i; j++) fenced[j] = true;
      open = null;
    }
  });
  return { lines, fences, fenced };
}

interface Heading {
  readonly title: string;
  /** 0-based line. */
  readonly line: number;
}

function headings(parsed: Parsed, level: 1 | 2): Heading[] {
  const prefix = `${'#'.repeat(level)} `;
  return parsed.lines.flatMap((line, i) =>
    !parsed.fenced[i] && line.startsWith(prefix)
      ? [{ title: line.slice(prefix.length).trim(), line: i }]
      : [],
  );
}

/** The 0-based line range [from, to) of the `## title` section's body. */
function sectionRange(
  parsed: Parsed,
  title: string,
): { from: number; to: number } | null {
  const h2 = headings(parsed, 2);
  const at = h2.findIndex((h) => h.title === title);
  if (at === -1) return null;
  return {
    from: (h2[at] as Heading).line + 1,
    to: h2[at + 1]?.line ?? parsed.lines.length,
  };
}

function sectionText(parsed: Parsed, title: string): string | null {
  const range = sectionRange(parsed, title);
  return range === null
    ? null
    : parsed.lines.slice(range.from, range.to).join('\n');
}

/** Replaces each match with `replacement` plus the line breaks it held. */
function keepLines(
  text: string,
  pattern: RegExp,
  replacement: string | ((...groups: string[]) => string),
): string {
  return text.replace(pattern, (match: string, ...groups: string[]) => {
    const kept =
      typeof replacement === 'string' ? replacement : replacement(...groups);
    return kept + '\n'.repeat(match.split('\n').length - 1);
  });
}

/**
 * Removes every HTML comment, keeping the line breaks it held. An unclosed
 * comment runs to the end of the text, as it does in a browser. It scans with
 * indexOf so no `<!--` survives a pass, which a single regex replace allows.
 */
function withoutComments(text: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const open = text.indexOf('<!--', from);
    if (open === -1) return out + text.slice(from);
    const close = text.indexOf('-->', open + 4);
    const end = close === -1 ? text.length : close + 3;
    out +=
      text.slice(from, open) +
      '\n'.repeat(text.slice(open, end).split('\n').length - 1);
    from = end;
  }
}

/** The README's prose, line for line. See the file comment for what goes. */
export function proseOf(source: string): string {
  const parsed = parse(source);
  let text = parsed.lines
    .map((line, i) => (parsed.fenced[i] ? '' : line))
    .join('\n');
  text = withoutComments(text);
  text = keepLines(text, /(`+)[^`\n]*?\1/g, '');
  text = keepLines(text, /!\[[^\]]*\]\([^)]*\)/g, '');
  text = keepLines(text, /\[([^\]]*)\]\([^)]*\)/g, (label) => label ?? '');
  text = keepLines(text, /<https?:[^>\s]+>/g, '');
  // A tag keeps its name and loses its attributes, alt text included.
  text = keepLines(
    text,
    /<(\/?)([a-zA-Z][\w-]*)(?:\s[^>]*)?\/?>/g,
    (slash, name) => `<${slash ?? ''}${name ?? ''}>`,
  );
  return text;
}

/** `name at line N: text` for each line of `text` that a pattern matches. */
function hits(text: string, patterns: readonly Pattern[]): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, i) => {
    for (const { name, pattern } of patterns)
      if (pattern.test(line))
        found.push(`${name} at line ${i + 1}: ${line.trim()}`);
  });
  return found;
}

/** Each banned-prose pattern the prose of `source` matches, by name and line. */
export function bannedProse(source: string): string[] {
  return hits(proseOf(source), BANNED_PROSE);
}

/** Each pattern banned from the raw file that `source` matches. */
export function bannedRaw(source: string): string[] {
  return hits(source, BANNED);
}

function isPrerelease(version: string): boolean {
  return version.includes('-');
}

function majorMinor(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

function kindOf(name: Package | 'root'): Kind {
  return name === 'root' ? 'root' : SPECS[name].kind;
}

function packageOf(name: Package | 'root'): Package {
  return name === 'root' ? 'core' : name;
}

/** The badge lines the title block holds, in order. */
function badgesFor(name: Package | 'root'): string[] {
  const pkg = packageOf(name);
  const npm = `[![npm](https://img.shields.io/npm/v/@nexusdi/${pkg}/next)](https://www.npmjs.com/package/@nexusdi/${pkg})`;
  const license = `[![license](https://img.shields.io/npm/l/@nexusdi/${pkg})](${LICENSE_LINK})`;
  if (pkg !== 'core') return [npm, license];
  return [
    npm,
    '[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)',
    '[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)',
    license,
  ];
}

/** The one install line the README's Installation block holds. */
function installLineFor(
  name: Package | 'root',
  version: string,
  peers: readonly string[],
): string {
  const pkg = packageOf(name);
  const tag = isPrerelease(version) ? '@next' : '';
  const others = peers.filter((p) => p !== pkg && p !== 'core');
  const extras =
    pkg === 'core'
      ? []
      : [...others, ...(peers.includes('core') ? ['core'] : [])];
  return [
    'npm install',
    ...(SPECS[pkg].dev ? ['-D'] : []),
    ...[pkg, ...extras].map((p) => `@nexusdi/${p}${tag}`),
  ].join(' ');
}

/** Blocks of consecutive non-blank lines in [from, to), with their first line. */
function paragraphs(
  lines: readonly string[],
  from: number,
  to: number,
): { line: number; lines: string[] }[] {
  const found: { line: number; lines: string[] }[] = [];
  let current: { line: number; lines: string[] } | null = null;
  for (let i = from; i < to; i++) {
    const line = lines[i] as string;
    if (line.trim() === '') {
      current = null;
    } else if (current === null) {
      current = { line: i, lines: [line] };
      found.push(current);
    } else current.lines.push(line);
  }
  return found;
}

/**
 * The tagline a README shows under its title: the hero's `<p>` for core and
 * the root, the bold line under the badges for the others. Undefined when the
 * README has none where it belongs.
 */
export function taglineOf(
  source: string,
  name: Package | 'root',
): string | undefined {
  const parsed = parse(source);
  const kind = kindOf(name);
  if (kind === 'core' || kind === 'root') {
    const close = parsed.lines.indexOf('</div>');
    const hero = parsed.lines.slice(0, close === -1 ? 0 : close + 1);
    for (const line of hero) {
      const m = HERO_TAGLINE.exec(line);
      if (m) return (m[1] as string).trim();
    }
    return undefined;
  }
  const firstH2 = headings(parsed, 2)[0]?.line ?? parsed.lines.length;
  const tag = paragraphs(parsed.lines, 0, firstH2)[2]?.lines;
  const line = tag?.length === 1 ? (tag[0] as string).trim() : '';
  return BOLD_LINE.test(line) ? line.slice(2, -2).trim() : undefined;
}

/**
 * The required H2s of the kind, in order, with the last two closing the
 * README. Every other H2 sits before the documentation heading, and at least
 * one opens the README before the first required H2.
 */
function checkHeadings(
  input: ReadmeInput,
  parsed: Parsed,
  kind: Kind,
  faults: Fault[],
): void {
  const actual = headings(parsed, 2).map((h) => h.title);
  const required = HEADINGS[kind];
  const positions = required.map((title) => actual.indexOf(title));
  const missing = required.filter((_, i) => positions[i] === -1);
  const ordered = positions.every(
    (p, i) => i === 0 || p > (positions[i - 1] as number),
  );
  const closing = actual.slice(-2).join('|') === required.slice(-2).join('|');
  const concept = (positions[0] ?? -1) > 0;
  const twice = required.filter(
    (title) => actual.filter((t) => t === title).length > 1,
  );
  if (missing.length > 0 || !ordered || !closing || !concept || twice.length)
    faults.push({
      rule: 'headings',
      message: `H2 headings are [${actual.join(', ')}], expected at least one H2 of the README's own, then [${required.join(', ')}] in that order, ending with the last two${missing.length > 0 ? `; missing ${missing.join(', ')}` : ''}`,
    });

  const want = LIMITS[kind].title(packageOf(input.name));
  const h1 = headings(parsed, 1);
  if (want.startsWith('# ')) {
    if (h1.length !== 1)
      faults.push({
        rule: 'headings',
        message: `has ${h1.length} markdown H1 heading(s), expected 1`,
      });
  } else if (h1.length !== 0)
    faults.push({
      rule: 'headings',
      message: `has ${h1.length} markdown H1 heading(s), expected none beside the hero's <h1>`,
    });
}

function checkLength(parsed: Parsed, kind: Kind, faults: Fault[]): void {
  const limit = LIMITS[kind].maxLines;
  const count =
    parsed.lines.at(-1) === '' ? parsed.lines.length - 1 : parsed.lines.length;
  if (count > limit)
    faults.push({
      rule: 'length',
      message: `has ${count} lines, at most ${limit} allowed`,
    });
}

function checkBadges(
  name: Package | 'root',
  badges: readonly string[],
  faults: Fault[],
): void {
  const expected = badgesFor(name);
  if (
    badges.length !== expected.length ||
    expected.some((b, i) => badges[i] !== b)
  )
    faults.push({
      rule: 'badges',
      message: `badges are\n${badges.join('\n')}\nexpected\n${expected.join('\n')}`,
    });
}

/** Title, badges, tagline and the lead-in before the first H2. */
function checkTop(input: ReadmeInput, parsed: Parsed, faults: Fault[]): void {
  const kind = kindOf(input.name);
  const title = LIMITS[kind].title(packageOf(input.name));
  const firstH2 = headings(parsed, 2)[0]?.line ?? parsed.lines.length;
  const tagline = taglineOf(input.source, input.name);

  if (kind === 'core' || kind === 'root') {
    const close = parsed.lines.indexOf('</div>');
    if (parsed.lines[0] !== '<div align="center">' || close === -1) {
      faults.push({
        rule: 'hero',
        message: 'does not open with a <div align="center"> hero',
      });
      return;
    }
    const hero = parsed.lines.slice(0, close + 1);
    if (!hero.some((l) => l.trim() === title))
      faults.push({ rule: 'hero', message: `hero has no ${title}` });
    if (!hero.some((l) => l.includes(`src="${LOGO}"`)))
      faults.push({ rule: 'hero', message: `hero has no logo from ${LOGO}` });
    if (tagline === undefined)
      faults.push({
        rule: 'tagline',
        message: 'hero has no <p> tagline on a line of its own',
      });
    checkBadges(
      input.name,
      hero.filter((l) => l.startsWith('[![')),
      faults,
    );
    if (paragraphs(parsed.lines, close + 1, firstH2).length === 0)
      faults.push({
        rule: 'lead-in',
        message: 'has no lead-in paragraph between the hero and the first H2',
      });
    return;
  }

  const blocks = paragraphs(parsed.lines, 0, firstH2);
  const [heading, badges, , ...leadIn] = blocks;
  if (heading?.lines.join('\n') !== title)
    faults.push({
      rule: 'hero',
      message: `does not open with the H1 "${title}" on its own`,
    });
  checkBadges(input.name, badges?.lines ?? [], faults);
  if (tagline === undefined)
    faults.push({
      rule: 'tagline',
      message:
        'the paragraph under the badges is not a one-line bold tagline (**...**)',
    });
  if (leadIn.length === 0)
    faults.push({
      rule: 'lead-in',
      message: 'has no lead-in paragraph between the tagline and the first H2',
    });
}

function checkRcNotice(
  input: ReadmeInput,
  parsed: Parsed,
  kind: Kind,
  faults: Fault[],
): void {
  const prerelease = isPrerelease(input.version);
  const notices = parsed.lines
    .map((line, i) => ({ line: i, m: RC_NOTICE.exec(line) }))
    .filter((n) => !parsed.fenced[n.line] && n.m !== null);
  if (!prerelease) {
    if (notices.length > 0)
      faults.push({
        rule: 'rc-notice',
        message: `carries the release candidate notice at line ${(notices[0] as { line: number }).line + 1}, and ${input.version} is not a prerelease`,
      });
    return;
  }
  for (const { line, m } of notices)
    if (m?.[1] !== majorMinor(input.version))
      faults.push({
        rule: 'rc-notice',
        message: `the notice at line ${line + 1} names ${m?.[1]}, and the package is ${majorMinor(input.version)}`,
      });
  if (kind !== 'core' && kind !== 'root') return;
  const range = sectionRange(parsed, 'Installation');
  if (
    range !== null &&
    !notices.some((n) => n.line >= range.from && n.line < range.to)
  )
    faults.push({
      rule: 'rc-notice',
      message: `Installation does not say "> ${majorMinor(input.version)} is currently in Release Candidate."`,
    });
}

function checkInstall(
  input: ReadmeInput,
  parsed: Parsed,
  faults: Fault[],
): void {
  const range = sectionRange(parsed, 'Installation');
  if (range === null) return;
  const block = parsed.fences.find(
    (f) => f.start >= range.from && f.start < range.to && f.info === 'bash',
  );
  const expected = installLineFor(input.name, input.version, input.peers);
  const actual = block?.body.filter((l) => l.trim() !== '') ?? [];
  if (actual.length !== 1 || actual[0] !== expected)
    faults.push({
      rule: 'install',
      message: `Installation's bash block is [${actual.join(' | ')}], expected [${expected}]`,
    });
}

/** The page source a docs site path names, or null when no page exists. */
function docsPage(path: string, exists: (p: string) => boolean): string | null {
  const slug = path.replace(/[#?].*$/, '').replace(/^\/+|\/+$/g, '');
  const candidates =
    slug === ''
      ? [`${DOCS_CONTENT}/index.mdx`, `${DOCS_CONTENT}/index.md`]
      : [
          `${DOCS_CONTENT}/${slug}.mdx`,
          `${DOCS_CONTENT}/${slug}.md`,
          `${DOCS_CONTENT}/${slug}/index.mdx`,
          `${DOCS_CONTENT}/${slug}/index.md`,
        ];
  return candidates.find((c) => exists(c)) ?? null;
}

/**
 * The documentation H2 links into the docs site, and every docs site link in
 * the README uses the release channel's base and names a page that exists.
 */
function checkDocumentation(
  input: ReadmeInput,
  parsed: Parsed,
  kind: Kind,
  faults: Fault[],
): void {
  const base = isPrerelease(input.version) ? DOCS_SITE.next : DOCS_SITE.latest;
  const docsHeading = HEADINGS[kind].at(-2) as string;
  const text = sectionText(parsed, docsHeading);
  if (text !== null) {
    const links = [...text.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map(
      (m) => m[1] as string,
    );
    if (!links.some((url) => url.startsWith(base)))
      faults.push({
        rule: 'documentation',
        message: `${docsHeading} links no page under ${base}`,
      });
  }
  const urls = input.source.matchAll(/https:\/\/nexus\.js\.org\/[^\s)"'<>]*/g);
  for (const [url] of urls) {
    if (!url.startsWith(base)) {
      faults.push({
        rule: 'documentation',
        message: `${url} is not on ${base}, the docs of ${input.version}`,
      });
      continue;
    }
    if (docsPage(url.slice(base.length), input.exists) === null)
      faults.push({
        rule: 'documentation',
        message: `${url} names no page under ${DOCS_CONTENT}`,
      });
  }
}

/**
 * Every repo URL but the logo and the LICENSE link names the release tag of
 * package.json's version, in repoUrlFor's form, and a path the working tree
 * holds. A branch goes away (release/X.Y at promotion) or lacks the file
 * (main during an RC); a tag holds the README's own files for good. The
 * release's version step moves the URLs to each new tag
 * (tools/release/version-actions.mjs).
 */
function checkRepoUrls(input: ReadmeInput, faults: Fault[]): void {
  const urls = input.source.matchAll(
    /https:\/\/(?:github\.com\/NexusDI\/core\/(tree|blob)\/|raw\.githubusercontent\.com\/NexusDI\/core\/)[^\s)"'<>]*/gi,
  );
  for (const [url, kind] of urls) {
    if (url === LOGO || url === LICENSE_LINK) continue;
    const prefix = repoUrlFor({
      kind: kind === 'tree' || kind === 'blob' ? kind : 'raw',
      version: input.version,
      path: '',
    });
    if (!url.startsWith(prefix)) {
      faults.push({
        rule: 'repo-urls',
        message: `${url} must use ${prefix}; the release's version step keeps it in step (tools/release/version-actions.mjs)`,
      });
      continue;
    }
    // An image's file is the images rule's to check.
    if (kind !== 'tree' && kind !== 'blob') continue;
    const path = url
      .slice(prefix.length)
      .replace(/[#?].*$/, '')
      .replace(/\/$/, '');
    if (path !== '' && !input.exists(path))
      faults.push({
        rule: 'repo-urls',
        message: `${url} names ${path}, which is not in the working tree`,
      });
  }
}

/** A raw URL the README may show: the logo on main, or a file at a release tag. */
const RAW_FILE =
  /^https:\/\/raw\.githubusercontent\.com\/NexusDI\/core\/(?:main|refs\/tags\/@nexusdi\/core@[^/]+)\/(.+)$/;

function checkImages(
  input: ReadmeInput,
  parsed: Parsed,
  faults: Fault[],
): void {
  const text = withoutComments(
    parsed.lines.map((line, i) => (parsed.fenced[i] ? '' : line)).join('\n'),
  );
  const images: { alt: string; src: string }[] = [
    ...[...text.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({
      alt: /\balt="([^"]*)"/.exec(tag)?.[1] ?? '',
      src: /\bsrc="([^"]*)"/.exec(tag)?.[1] ?? '',
    })),
    ...[...text.matchAll(/!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g)].map((m) => ({
      alt: m[1] ?? '',
      src: m[2] ?? '',
    })),
  ];
  for (const { alt, src } of images) {
    if (alt.trim() === '')
      faults.push({ rule: 'images', message: `image ${src} has no alt text` });
    if (!src.startsWith('https://'))
      faults.push({
        rule: 'images',
        message: `image ${src} is not an absolute https:// URL`,
      });
    if (/^https:\/\/raw\.githubusercontent\.com\/NexusDI\/core\//i.test(src)) {
      const file = RAW_FILE.exec(src)?.[1];
      if (file === undefined)
        faults.push({
          rule: 'images',
          message: `image ${src} uses a ref the check does not know`,
        });
      else if (!input.exists(file))
        faults.push({
          rule: 'images',
          message: `image ${src} names ${file}, which is not in the working tree`,
        });
    }
  }
}

function checkLicense(parsed: Parsed, faults: Fault[]): void {
  const text = sectionText(parsed, 'License');
  if (text === null) return;
  if (text.trim() !== 'MIT')
    faults.push({
      rule: 'license',
      message: `License body is "${text.trim()}", expected "MIT"`,
    });
}

/** A ts block that is no doctest, and a mermaid block npm prints as code. */
function fenceFaults(file: string, parsed: Parsed): Fault[] {
  const faults: Fault[] = [];
  for (const fence of parsed.fences) {
    const at = `${file}:${fence.start + 1}`;
    if (fence.info !== DOCTEST && /^(ts|typescript)\b/.test(fence.info))
      faults.push({
        rule: 'doctests',
        message: `${at}: a \`\`\`${fence.info} block is not a doctest; use \`\`\`${DOCTEST}`,
      });
    else if (/^mermaid\b/.test(fence.info))
      faults.push({
        rule: 'doctests',
        message: `${at}: npm prints a mermaid block as code`,
      });
  }
  return faults;
}

/**
 * A `docs/*.md` region file: each doctest sits inside matching region
 * markers and carries a `// ->` claim.
 */
function regionFileFaults(file: string, parsed: Parsed): Fault[] {
  const faults = fenceFaults(file, parsed);
  const nonBlank = (from: number, step: 1 | -1): string => {
    for (let i = from; i >= 0 && i < parsed.lines.length; i += step)
      if ((parsed.lines[i] as string).trim() !== '')
        return (parsed.lines[i] as string).trim();
    return '';
  };
  for (const fence of parsed.fences.filter((f) => f.info === DOCTEST)) {
    const at = `${file}:${fence.start + 1}`;
    const open = /^<!-- #region (\S+) -->$/.exec(nonBlank(fence.start - 1, -1));
    const close = /^<!-- #endregion (\S+) -->$/.exec(
      nonBlank(fence.end + 1, 1),
    );
    if (open === null || close === null || open[1] !== close[1])
      faults.push({
        rule: 'doctests',
        message: `${at}: doctest is not inside matching <!-- #region name --> markers`,
      });
    if (!fence.body.some((line) => line.includes(CLAIM)))
      faults.push({
        rule: 'doctests',
        message: `${at}: doctest has no // -> claim`,
      });
  }
  return faults;
}

/**
 * Every ts block runs as a doctest, and one of them claims a value with
 * `// ->`. Nothing runs the root README, so each of its doctests is a copy of
 * one in core's README, which runs.
 */
function checkDoctests(
  input: ReadmeInput,
  parsed: Parsed,
  faults: Fault[],
): void {
  const kind = kindOf(input.name);
  faults.push(...fenceFaults('README.md', parsed));
  const doctests = parsed.fences.filter((f) => f.info === DOCTEST);
  if (kind === 'cli' && doctests.length > 0)
    faults.push({
      rule: 'doctests',
      message: `holds ${doctests.length} doctest blocks, and nothing runs the cli README's doctests`,
    });
  if (
    LIMITS[kind].claim &&
    !doctests.some((f) => f.body.some((line) => line.includes(CLAIM)))
  )
    faults.push({
      rule: 'doctests',
      message: 'has no doctest (```ts @import.meta.vitest) with a // -> claim',
    });
  if (kind === 'root') {
    const core = parse(input.core ?? '')
      .fences.filter((f) => f.info === DOCTEST)
      .map((f) => f.body.join('\n'));
    for (const fence of doctests)
      if (!core.includes(fence.body.join('\n')))
        faults.push({
          rule: 'doctests',
          message: `README.md:${fence.start + 1}: the root README's doctest is not a copy of one in core's README, and nothing runs the root's`,
        });
  }
  for (const doc of input.docs)
    faults.push(...regionFileFaults(doc.file, parse(doc.source)));
}

/**
 * Examples bind a `Token<IFoo>` with `provide(TOKEN, { useClass })` and list
 * tokens in deps, never one class straight to another. core's first doctest
 * is its Quick Start, which binds classes as their own tokens the way
 * `/getting-started/` does (spec decision 31); the root copies core's.
 */
function checkInterfaceFirst(
  input: ReadmeInput,
  parsed: Parsed,
  faults: Fault[],
): void {
  const kind = kindOf(input.name);
  if (kind === 'root' || kind === 'cli') return;
  const doctests = parsed.fences.filter((f) => f.info === DOCTEST);
  const checked = kind === 'core' ? doctests.slice(1) : doctests;
  for (const fence of checked) {
    const body = fence.body.join('\n');
    const found = [
      ...interfaceFirstHits(body),
      ...(/\bToken<\s*any\s*>/.test(body) ? ['Token<any>'] : []),
    ];
    if (found.length > 0)
      faults.push({
        rule: 'interface-first',
        message: `README.md:${fence.start + 1}: binds a class where an interface token belongs (${found.join(', ')}). Give the service an interface and a Token<IFoo>, and bind the class with useClass.`,
      });
  }
  const first = doctests[0];
  if (
    kind === 'sub-package' &&
    first !== undefined &&
    !(
      // A federation contract's token<IFoo>() is an interface token too.
      first.body.some((l) => /\bToken<|\.token</.test(l)) &&
      first.body.some((l) => l.includes('provide('))
    )
  )
    faults.push({
      rule: 'interface-first',
      message:
        'the first doctest does not bind an interface token (Token< or a contract token<) with provide(',
    });
}

/** Every `@nexusdi/*` package the README names is one this repo publishes. */
function checkPackages(input: ReadmeInput, faults: Fault[]): void {
  const known = new Set<string>(PACKAGES);
  const named = new Set(
    [...input.source.matchAll(/@nexusdi\/([a-z][a-z0-9-]*)/g)].map(
      (m) => m[1] as string,
    ),
  );
  for (const name of named)
    if (!known.has(name))
      faults.push({
        rule: 'packages',
        message: `names @nexusdi/${name}, which this repository does not publish`,
      });
}

/** Every fault in one README against the npm README standard. */
export function readmeFaults(input: ReadmeInput): Fault[] {
  const parsed = parse(input.source);
  const kind = kindOf(input.name);
  const faults: Fault[] = [];
  checkHeadings(input, parsed, kind, faults);
  checkLength(parsed, kind, faults);
  checkTop(input, parsed, faults);
  checkRcNotice(input, parsed, kind, faults);
  checkInstall(input, parsed, faults);
  checkDocumentation(input, parsed, kind, faults);
  checkRepoUrls(input, faults);
  checkImages(input, parsed, faults);
  checkLicense(parsed, faults);
  checkDoctests(input, parsed, faults);
  checkInterfaceFirst(input, parsed, faults);
  checkPackages(input, faults);
  for (const hit of bannedRaw(input.source))
    faults.push({ rule: 'banned', message: hit });
  for (const hit of bannedProse(input.source))
    faults.push({ rule: 'banned-prose', message: hit });
  return faults;
}
