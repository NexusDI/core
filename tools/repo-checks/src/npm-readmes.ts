import { repoUrlFor } from '@nexusdi/release';

import {
  GRAPH_IMAGE,
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
  | 'ingress'
  | 'bullets'
  | 'rc-notice'
  | 'install'
  | 'documentation'
  | 'repo-urls'
  | 'images'
  | 'license'
  | 'doctests'
  | 'regions'
  | 'root-copy'
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
  /** core's README, which the root README copies. Needed for `root`. */
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
  { name: 'dash', pattern: /[\u2014\u2013]/ },
  { name: 'bold', pattern: /\*\*|__\w|<(strong|b)>/ },
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

const CORE_LINK = '](https://www.npmjs.com/package/@nexusdi/core)';
const GITHUB = 'https://github.com/NexusDI/core';
const LICENSE_LINK = 'https://github.com/NexusDI/core/blob/main/LICENSE';
const RC_NOTICE =
  /^> (\d+\.\d+) is a release candidate on the npm `next` tag\./;
const DOCTEST = 'ts @import.meta.vitest';
/**
 * The toolchain bullet in core and decorators names every passing toolchain,
 * which takes more than 12 words. core-readme-claims.test.ts checks its list
 * against the toolchain matrix.
 */
const TOOLCHAIN_BULLET = /^- Runs under /;

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
  // A tag keeps its name, so the bold rule still sees <strong> and <b>.
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

/** Words a reader sees: link text and inline code count, URLs and tags do not. */
function words(text: string): number {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '').length;
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

/** The badge lines the hero holds, in order. */
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

/** The one install line the README's Install block holds. */
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

function checkHeadings(parsed: Parsed, kind: Kind, faults: Fault[]): void {
  const actual = headings(parsed, 2).map((h) => h.title);
  const expected = HEADINGS[kind];
  const optional = expected.indexOf(null);
  const fits =
    optional === -1
      ? actual.length === expected.length &&
        expected.every((title, i) => actual[i] === title)
      : (actual.length === expected.length ||
          actual.length === expected.length - 1) &&
        expected.slice(0, optional).every((title, i) => actual[i] === title) &&
        expected
          .slice(optional + 1)
          .reverse()
          .every((title, i) => actual[actual.length - 1 - i] === title);
  if (!fits)
    faults.push({
      rule: 'headings',
      message: `H2 headings are [${actual.join(', ')}], expected [${expected
        .map((t) => t ?? '<one optional H2>')
        .join(', ')}]`,
    });
  const h1 = headings(parsed, 1);
  const wantH1 = kind === 'sub-package' || kind === 'cli' ? 1 : 0;
  if (h1.length !== wantH1)
    faults.push({
      rule: 'headings',
      message: `has ${h1.length} markdown H1 heading(s), expected ${wantH1}`,
    });
}

function firstExample(parsed: Parsed, kind: Kind): Fence | undefined {
  if (kind === 'cli') {
    const usage = sectionRange(parsed, 'Usage');
    return usage === null
      ? undefined
      : parsed.fences.find((f) => f.start >= usage.from && f.start < usage.to);
  }
  return parsed.fences.find((f) => /^(ts|typescript)\b/.test(f.info));
}

function checkLength(parsed: Parsed, kind: Kind, faults: Fault[]): void {
  const limits = LIMITS[kind];
  const count =
    parsed.lines.at(-1) === '' ? parsed.lines.length - 1 : parsed.lines.length;
  if (count > limits.maxLines)
    faults.push({
      rule: 'length',
      message: `has ${count} lines, at most ${limits.maxLines} allowed`,
    });
  const example = firstExample(parsed, kind);
  if (example === undefined)
    faults.push({ rule: 'length', message: 'has no first example' });
  else if (example.body.length > limits.maxFirstExample)
    faults.push({
      rule: 'length',
      message: `first example (line ${example.start + 1}) has ${example.body.length} lines, at most ${limits.maxFirstExample} allowed`,
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

function checkIngress(
  kind: Kind,
  ingress: string | undefined,
  faults: Fault[],
): void {
  if (ingress === undefined) {
    faults.push({ rule: 'ingress', message: 'has no ingress paragraph' });
    return;
  }
  const count = words(ingress);
  if (count > 40)
    faults.push({
      rule: 'ingress',
      message: `ingress has ${count} words, at most 40 allowed`,
    });
  if (kind === 'core' || kind === 'root') {
    for (const phrase of [
      'validates the whole module graph',
      'No runtime dependencies',
    ])
      if (!ingress.includes(phrase))
        faults.push({
          rule: 'ingress',
          message: `ingress does not say "${phrase}"`,
        });
  } else if (!ingress.includes(CORE_LINK))
    faults.push({
      rule: 'ingress',
      message: `ingress does not link [NexusDI]${CORE_LINK.slice(1)}`,
    });
}

function checkBullets(
  kind: Kind,
  bullets: readonly string[] | undefined,
  faults: Fault[],
): void {
  const allowed = LIMITS[kind].bullets;
  if (bullets === undefined || bullets.length === 0) {
    faults.push({ rule: 'bullets', message: 'has no bullet list' });
    return;
  }
  const loose = bullets.filter((line) => !line.startsWith('- '));
  if (loose.length > 0)
    faults.push({
      rule: 'bullets',
      message: `bullet list holds lines that are not one-line bullets: ${loose.join(' | ')}`,
    });
  const items = bullets.filter((line) => line.startsWith('- '));
  if (!allowed.includes(items.length))
    faults.push({
      rule: 'bullets',
      message: `bullet list has ${items.length} items, expected ${allowed.join(' or ')}`,
    });
  for (const item of items) {
    const count = words(item.slice(2));
    if (count > 12 && !TOOLCHAIN_BULLET.test(item))
      faults.push({
        rule: 'bullets',
        message: `bullet has ${count} words, at most 12 allowed: ${item}`,
      });
  }
}

/** Hero, badges, tagline, ingress, bullet list and graph image. */
function checkTop(input: ReadmeInput, parsed: Parsed, faults: Fault[]): void {
  const kind = kindOf(input.name);
  const pkg = packageOf(input.name);
  const tagline = SPECS[pkg].tagline;
  const firstH2 = headings(parsed, 2)[0]?.line ?? parsed.lines.length;

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
    if (!hero.some((l) => l.trim() === '<h1>NexusDI</h1>'))
      faults.push({ rule: 'hero', message: 'hero has no <h1>NexusDI</h1>' });
    if (!hero.some((l) => l.includes(`src="${LOGO}"`)))
      faults.push({ rule: 'hero', message: `hero has no logo from ${LOGO}` });
    if (!hero.some((l) => l.trim() === `<p>${tagline}</p>`))
      faults.push({
        rule: 'tagline',
        message: `hero has no <p>${tagline}</p>`,
      });
    checkBadges(
      input.name,
      hero.filter((l) => l.startsWith('[![')),
      faults,
    );
    const after = paragraphs(parsed.lines, close + 1, firstH2);
    if (after.length > 1)
      faults.push({
        rule: 'hero',
        message: `holds ${after.length} paragraphs between the hero and the first H2, expected the ingress alone`,
      });
    checkIngress(kind, after[0]?.lines.join('\n'), faults);
    const features = sectionRange(parsed, 'Features');
    const list =
      features === null
        ? undefined
        : paragraphs(parsed.lines, features.from, features.to)[0]?.lines;
    checkBullets(kind, list, faults);
    return;
  }

  const blocks = paragraphs(parsed.lines, 0, firstH2);
  const [title, badges, tag, ingress, bullets, ...rest] = blocks;
  if (title?.lines.join('\n') !== `# @nexusdi/${pkg}`)
    faults.push({
      rule: 'hero',
      message: `does not open with the H1 "# @nexusdi/${pkg}" on its own`,
    });
  checkBadges(input.name, badges?.lines ?? [], faults);
  if (tag?.lines.join('\n') !== tagline)
    faults.push({
      rule: 'tagline',
      message: `tagline is "${tag?.lines.join(' ') ?? ''}", expected "${tagline}"`,
    });
  checkIngress(kind, ingress?.lines.join('\n'), faults);
  checkBullets(kind, bullets?.lines, faults);
  const graph = pkg === 'devtools' || pkg === 'cli';
  const image = graph ? rest.shift() : undefined;
  if (graph) {
    const tagText = image?.lines.join(' ') ?? '';
    if (
      !/^<img\b/.test(tagText) ||
      !tagText.includes(`/${GRAPH_IMAGE}"`) ||
      !/\bwidth="720"/.test(tagText)
    )
      faults.push({
        rule: 'images',
        message: `does not show the graph image (<img src=".../${GRAPH_IMAGE}" alt="..." width="720">) under the bullet list`,
      });
  }
  // One caption may follow the graph image to say how it was drawn.
  if (graph && rest[0]?.lines.join(' ').startsWith('Drawn with ')) rest.shift();
  if (rest.length > 0)
    faults.push({
      rule: 'hero',
      message: `holds an extra paragraph at line ${(rest[0] as { line: number }).line + 1} before the first H2`,
    });
}

function checkInstall(
  input: ReadmeInput,
  parsed: Parsed,
  faults: Fault[],
): void {
  const range = sectionRange(parsed, 'Install');
  if (range === null) return;
  const prerelease = isPrerelease(input.version);
  const opening = paragraphs(parsed.lines, range.from, range.to)[0]?.lines[0];
  const notice = RC_NOTICE.exec(opening ?? '');
  if (prerelease && notice?.[1] !== majorMinor(input.version))
    faults.push({
      rule: 'rc-notice',
      message: `Install does not open with "> ${majorMinor(input.version)} is a release candidate on the npm \`next\` tag. ..."`,
    });
  if (!prerelease && parsed.lines.some((l) => RC_NOTICE.test(l)))
    faults.push({
      rule: 'rc-notice',
      message: `carries the release candidate notice, and ${input.version} is not a prerelease`,
    });

  const block = parsed.fences.find(
    (f) => f.start >= range.from && f.start < range.to && f.info === 'bash',
  );
  const expected = installLineFor(input.name, input.version, input.peers);
  const actual = block?.body.filter((l) => l.trim() !== '') ?? [];
  if (actual.length !== 1 || actual[0] !== expected)
    faults.push({
      rule: 'install',
      message: `Install's bash block is [${actual.join(' | ')}], expected [${expected}]`,
    });
}

function checkDocumentation(
  input: ReadmeInput,
  parsed: Parsed,
  faults: Fault[],
): void {
  const text = sectionText(parsed, 'Documentation');
  if (text === null) return;
  const pkg = packageOf(input.name);
  const links = [...text.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)/gm)].map(
    (m) => `[${m[1]}](${m[2]})`,
  );
  const folder = `libs/${pkg}/docs`;
  const expected = [
    `[Documentation](${isPrerelease(input.version) ? 'https://nexus.js.org/next/' : 'https://nexus.js.org/'})`,
    `[Examples](${repoUrlFor({ kind: 'tree', version: input.version, path: folder })})`,
    `[NexusDI on GitHub](${GITHUB})`,
  ];
  const extra = pkg === 'core' ? 1 : 0;
  if (
    links.length !== expected.length + extra ||
    expected.some((link, i) => links[i] !== link)
  )
    faults.push({
      rule: 'documentation',
      message: `Documentation links are\n${links.join('\n')}\nexpected\n${expected.join('\n')}${extra ? '\nand the 0.4 RC feedback Discussion' : ''}`,
    });
  if (!input.exists(folder))
    faults.push({
      rule: 'documentation',
      message: `the Examples link names ${folder}, which does not exist`,
    });
}

/**
 * Every repo URL but the logo and the LICENSE link names the release tag of
 * package.json's version, in repoUrlFor's form. A branch goes away
 * (release/X.Y at promotion) or lacks the file (main during an RC); a tag
 * holds the README's own files for good. The release's version step moves
 * the URLs to each new tag (tools/release/version-actions.mjs).
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
    if (url.startsWith(prefix)) continue;
    faults.push({
      rule: 'repo-urls',
      message: `${url} must use ${prefix}; the release's version step keeps it in step (tools/release/version-actions.mjs)`,
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

/** Region markers, `// ->` claims, and no plain ts or mermaid block. */
function doctestFaults(file: string, parsed: Parsed): Fault[] {
  const faults: Fault[] = [];
  const nonBlank = (from: number, step: 1 | -1): string => {
    for (let i = from; i >= 0 && i < parsed.lines.length; i += step)
      if ((parsed.lines[i] as string).trim() !== '')
        return (parsed.lines[i] as string).trim();
    return '';
  };
  for (const fence of parsed.fences) {
    const at = `${file}:${fence.start + 1}`;
    if (fence.info === DOCTEST) {
      const open = /^<!-- #region (\S+) -->$/.exec(
        nonBlank(fence.start - 1, -1),
      );
      const close = /^<!-- #endregion (\S+) -->$/.exec(
        nonBlank(fence.end + 1, 1),
      );
      if (open === null || close === null || open[1] !== close[1])
        faults.push({
          rule: 'doctests',
          message: `${at}: doctest is not inside matching <!-- #region name --> markers`,
        });
      if (!fence.body.some((line) => line.includes('// -> ')))
        faults.push({
          rule: 'doctests',
          message: `${at}: doctest has no // -> claim`,
        });
    } else if (/^(ts|typescript)\b/.test(fence.info))
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

function checkDoctests(
  input: ReadmeInput,
  parsed: Parsed,
  faults: Fault[],
): void {
  const kind = kindOf(input.name);
  faults.push(...doctestFaults('README.md', parsed));
  const doctests = parsed.fences.filter((f) => f.info === DOCTEST);
  const range = LIMITS[kind].doctests;
  if (
    range !== null &&
    (doctests.length < range[0] || doctests.length > range[1])
  )
    faults.push({
      rule: 'doctests',
      message: `has ${doctests.length} doctest blocks, expected ${range[0] === range[1] ? range[0] : `${range[0]} to ${range[1]}`}`,
    });
  const first = doctests[0];
  if (
    kind === 'sub-package' &&
    first !== undefined &&
    !(
      first.body.some((l) => l.includes('Token<')) &&
      first.body.some((l) => l.includes('provide('))
    )
  )
    faults.push({
      rule: 'doctests',
      message:
        'the first doctest does not bind an interface token with Token< and provide(',
    });
  for (const doc of input.docs)
    faults.push(...doctestFaults(doc.file, parse(doc.source)));
}

function regionNames(source: string): string[] {
  return [...source.matchAll(/<!-- #region (\S+) -->/g)].map(
    (m) => m[1] as string,
  );
}

function checkRegions(input: ReadmeInput, faults: Fault[]): void {
  if (input.name === 'root') return;
  const found = new Set([
    ...regionNames(input.source),
    ...input.docs.flatMap((doc) => regionNames(doc.source)),
  ]);
  const missing = SPECS[input.name].regions.filter((r) => !found.has(r));
  if (missing.length > 0)
    faults.push({
      rule: 'regions',
      message: `README.md and docs/*.md drop the 0.4.0-rc.0 regions ${missing.join(', ')}`,
    });
}

function checkPackages(parsed: Parsed, faults: Fault[]): void {
  const text = sectionText(parsed, 'Packages');
  if (text === null) return;
  for (const pkg of PACKAGES) {
    if (pkg === 'core') continue;
    if (!text.includes(`@nexusdi/${pkg}`) || !text.includes(SPECS[pkg].tagline))
      faults.push({
        rule: 'packages',
        message: `Packages does not list @nexusdi/${pkg} with its tagline`,
      });
  }
}

function checkRootCopy(input: ReadmeInput, faults: Fault[]): void {
  const core = input.core ?? '';
  const coreEnd = core.indexOf('\n## Checked at startup\n');
  const rootEnd = input.source.indexOf('\n## Packages\n');
  if (coreEnd === -1 || rootEnd === -1) {
    faults.push({
      rule: 'root-copy',
      message:
        'cannot compare the shared part: core needs "## Checked at startup" after Install, and the root needs "## Packages" after it',
    });
    return;
  }
  const shared = core.slice(0, coreEnd);
  const copy = input.source.slice(0, rootEnd);
  if (shared !== copy) {
    const a = shared.split('\n');
    const b = copy.split('\n');
    const line = a.findIndex((l, i) => b[i] !== l);
    faults.push({
      rule: 'root-copy',
      message: `differs from core's README from the hero through Install, first at line ${(line === -1 ? a.length : line) + 1}`,
    });
  }
}

/** Every fault in one README against the npm README standard. */
export function readmeFaults(input: ReadmeInput): Fault[] {
  const parsed = parse(input.source);
  const kind = kindOf(input.name);
  const faults: Fault[] = [];
  checkHeadings(parsed, kind, faults);
  checkLength(parsed, kind, faults);
  checkTop(input, parsed, faults);
  checkInstall(input, parsed, faults);
  if (kind !== 'root') checkDocumentation(input, parsed, faults);
  checkRepoUrls(input, faults);
  checkImages(input, parsed, faults);
  checkLicense(parsed, faults);
  checkDoctests(input, parsed, faults);
  checkRegions(input, faults);
  if (kind === 'core' || kind === 'root') checkPackages(parsed, faults);
  if (kind === 'root') checkRootCopy(input, faults);
  for (const hit of bannedRaw(input.source))
    faults.push({ rule: 'banned', message: hit });
  for (const hit of bannedProse(input.source))
    faults.push({ rule: 'banned-prose', message: hit });
  return faults;
}
