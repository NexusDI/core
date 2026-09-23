import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Lays out the GitHub Pages artifact for one deploy mode (docs spec §15.1,
 * §15.5, §15.6). Every input is a directory already built; this copies and
 * writes, and builds nothing.
 */

const DOMAIN = 'nexus.js.org';

/**
 * The root 404.html of the 0.3 snapshot answers every missing path. During the
 * RC a missing /next/ path would get a 0.3 page, so the first thing the page
 * runs sends it to the new site's own 404 page.
 */
export function rootNotFoundScript() {
  return (
    '<script>(function(){var p=location.pathname;' +
    "if(p.indexOf('/next/')===0&&p!=='/next/404.html'){location.replace('/next/404.html');}" +
    '})();</script>'
  );
}

/** A redirect page: GitHub Pages has no redirect mechanism of its own. */
export function stubHtml(target) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="robots" content="noindex">',
    `<meta http-equiv="refresh" content="0; url=${target}">`,
    `<link rel="canonical" href="https://${DOMAIN}${target}">`,
    '<title>Moved</title>',
    '</head>',
    '<body>',
    `<p>This page moved to <a href="${target}">${target}</a>.</p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Every file under `dir`, as forward-slash paths relative to `dir`. */
export function siteFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => statSync(join(dir, entry)).isFile())
    .map((entry) => entry.split(sep).join('/'));
}

function copyInto(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function write(site, path, body, { overwrite = true } = {}) {
  const target = join(site, path);
  if (!overwrite && existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
}

function injectNotFoundScript(site) {
  const path = join(site, '404.html');
  const html = readFileSync(path, 'utf8');
  if (!/<head[^>]*>/i.test(html))
    throw new Error(
      'the root 404.html has no <head> to hold the /next/ script',
    );
  writeFileSync(
    path,
    html.replace(/<head([^>]*)>/i, (tag) => `${tag}${rootNotFoundScript()}`),
  );
}

function removeNestedCname(site) {
  for (const path of siteFiles(site)) {
    if (path !== 'CNAME' && path.endsWith('/CNAME')) rmSync(join(site, path));
  }
}

function pathOf(file) {
  return `/${file.replace(/index\.html$/, '')}`;
}

function finalStubs(site, snapshotRoot, legacyPosts) {
  for (const file of siteFiles(snapshotRoot)) {
    if (!file.endsWith('.html')) continue;
    if (file.startsWith('docs/')) {
      write(site, file, stubHtml(`/v0.3${pathOf(file)}`), {
        overwrite: false,
      });
    } else if (/^blog\/(tags|archive|authors)\//.test(file)) {
      write(site, file, stubHtml('/blog/'), { overwrite: false });
    }
  }
  for (const post of legacyPosts) {
    const path = `${post.legacyUrl.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
    write(site, path, stubHtml(`/blog/${post.slug}/`), { overwrite: false });
  }
}

export function assemble({
  mode,
  site,
  nextOut,
  rootOut,
  snapshotRoot,
  snapshotArchive,
  legacyPosts = [],
  probe,
}) {
  rmSync(site, { recursive: true, force: true });

  if (mode === 'snapshot-only' || mode === 'rc') {
    copyInto(snapshotRoot, site);
    if (mode === 'rc') {
      if (existsSync(join(snapshotRoot, 'next'))) {
        throw new Error('the snapshot root already has a next/ directory');
      }
      copyInto(nextOut, join(site, 'next'));
      injectNotFoundScript(site);
    }
  } else if (mode === 'final' || mode === 'retired') {
    copyInto(rootOut, site);
    copyInto(nextOut, join(site, 'next'));
    finalStubs(site, snapshotRoot, legacyPosts);
    if (mode === 'final') {
      copyInto(snapshotArchive, join(site, 'v0.3'));
    } else {
      for (const file of siteFiles(snapshotArchive)) {
        if (file.endsWith('.html'))
          write(site, `v0.3/${file}`, stubHtml('/upgrade/'));
      }
    }
  } else {
    throw new Error(`unknown deploy mode "${mode}"`);
  }

  if (probe) copyInto(probe, join(site, '_sandbox-probe'));

  removeNestedCname(site);
  write(site, 'CNAME', `${DOMAIN}\n`);
  write(site, '.nojekyll', '');

  return { files: siteFiles(site).length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = process.env;
  const { files: count } = assemble({
    mode: env.DEPLOY_MODE,
    site: env.SITE_DIR ?? 'site',
    nextOut: env.NEXT_OUT,
    rootOut: env.ROOT_OUT,
    snapshotRoot: env.SNAPSHOT_ROOT,
    snapshotArchive: env.SNAPSHOT_ARCHIVE,
    probe: env.SANDBOX_PROBE_DIR || undefined,
  });
  console.log(
    `assembled ${count} files in ${relative(process.cwd(), env.SITE_DIR ?? 'site')} for mode ${env.DEPLOY_MODE}`,
  );
}
