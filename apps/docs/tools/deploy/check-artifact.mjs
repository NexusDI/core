import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { rootNotFoundScript, siteFiles } from './assemble.mjs';

/**
 * The "Check deploy artefacts" step of docs spec §15.5. Each finding names
 * the file and what is wrong with it; the CLI fails the deploy on any.
 */

export function siteCounts(site) {
  const counts = { root: 0, next: 0, 'v0.3': 0 };
  for (const file of siteFiles(site)) {
    if (file.startsWith('next/')) counts.next += 1;
    else if (file.startsWith('v0.3/')) counts['v0.3'] += 1;
    else counts.root += 1;
  }
  return counts;
}

const NEXT_REQUIRED = [
  'next/index.html',
  'next/404.html',
  'next/_pagefind/pagefind.js',
  'next/getting-started.md',
];

function requireFiles(findings, site, mode, paths) {
  for (const path of paths) {
    if (!existsSync(join(site, path)))
      findings.push(`missing from the ${mode} artifact: ${path}`);
  }
}

function requireMatch(findings, all, mode, label, pattern) {
  if (!all.some((file) => pattern.test(file))) {
    findings.push(`missing from the ${mode} artifact: ${label}`);
  }
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function archivePages(all) {
  return all.filter(
    (file) => file.startsWith('v0.3/') && file.endsWith('.html'),
  );
}

function checkArchive(findings, site, all) {
  for (const file of archivePages(all)) {
    const html = readFileSync(join(site, file), 'utf8');
    if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) {
      findings.push(`${file}: carries no noindex robots meta.`);
    }
    for (const [, attribute, value] of html.matchAll(
      /\s(href|src)="([^"]*)"/g,
    )) {
      if (EXTERNAL.test(value) || value.startsWith('/v0.3/') || value === '')
        continue;
      if (value.startsWith('/')) {
        findings.push(
          `${file}: ${attribute} "${value}" is root-relative outside /v0.3/.`,
        );
      }
    }
  }
}

export function checkArtifact(site, mode, options = {}) {
  const findings = [];
  const all = siteFiles(site);

  if (all.length === 0) return [`the ${mode} artifact is empty.`];

  if (!existsSync(join(site, 'CNAME'))) {
    findings.push(`missing from the ${mode} artifact: CNAME`);
  } else {
    const domain = readFileSync(join(site, 'CNAME'), 'utf8').trim();
    if (domain !== 'nexus.js.org') {
      findings.push(`CNAME reads "${domain}", and the site is nexus.js.org.`);
    }
  }
  for (const file of all) {
    if (file !== 'CNAME' && file.endsWith('/CNAME')) {
      findings.push(`${file}: only the root carries a CNAME.`);
    }
  }
  requireFiles(findings, site, mode, ['.nojekyll', 'index.html', '404.html']);

  const hasNext = all.some((file) => file.startsWith('next/'));

  if (mode === 'snapshot-only') {
    requireFiles(findings, site, mode, ['blog/rss.xml', 'blog/atom.xml']);
    if (hasNext)
      findings.push(
        'next/ exists in snapshot-only mode, which deploys the snapshot alone.',
      );
  }

  if (mode === 'rc' || mode === 'final' || mode === 'retired') {
    requireFiles(findings, site, mode, NEXT_REQUIRED);
    requireMatch(
      findings,
      all,
      mode,
      'next/runtime/types-*.json',
      /^next\/runtime\/types-[^/]+\.json$/,
    );
    requireMatch(
      findings,
      all,
      mode,
      'next/runtime/core-*/index.js',
      /^next\/runtime\/core-[^/]+\/index\.js$/,
    );
    if (all.some((file) => file.startsWith('next/blog/'))) {
      findings.push(
        'next/blog/ exists. The /next/ build leaves content/blog/ out.',
      );
    }
  }

  if (mode === 'rc') {
    requireFiles(findings, site, mode, ['blog/rss.xml', 'blog/atom.xml']);
    const notFound = join(site, '404.html');
    if (
      existsSync(notFound) &&
      !readFileSync(notFound, 'utf8').includes(rootNotFoundScript())
    ) {
      findings.push(
        '404.html does not carry the script that sends a missing /next/ path to /next/404.html.',
      );
    }
  }

  if (mode === 'final' || mode === 'retired') {
    requireFiles(findings, site, mode, [
      'blog/atom.xml',
      'blog/rss.xml',
      'blog/index.html',
      'v0.3/index.html',
      ...(options.posts ?? []).map((slug) => `blog/${slug}/index.html`),
    ]);
  }

  if (mode === 'final') checkArchive(findings, site, all);

  if (mode === 'retired') {
    for (const file of archivePages(all)) {
      if (
        !readFileSync(join(site, file), 'utf8').includes('http-equiv="refresh"')
      ) {
        findings.push(
          `${file}: retired mode serves redirect stubs under /v0.3/.`,
        );
      }
    }
  }

  return findings;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [site = 'site', mode] = process.argv.slice(2);
  const findings = checkArtifact(site, mode, {
    allowProbe: process.env.SANDBOX_PROBE === '1',
  });
  for (const [part, count] of Object.entries(siteCounts(site)))
    console.log(`${part}: ${count} files`);
  if (findings.length > 0) {
    console.error(findings.map((finding) => `- ${finding}`).join('\n'));
    process.exit(1);
  }
  console.log(`the ${mode} artifact looks deployable`);
}
