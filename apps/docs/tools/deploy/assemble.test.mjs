// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { assemble, rootNotFoundScript, stubHtml } from './assemble.mjs';

let work;

function tree(name, files) {
  const dir = join(work, name);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const page = (title) =>
  `<!doctype html><html><head><title>${title}</title></head><body>${title}</body></html>`;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'assemble-'));
});

function inputs() {
  return {
    site: join(work, 'site'),
    snapshotRoot: tree('snapshot-root', {
      'index.html': page('0.3 root'),
      '404.html': page('0.3 not found'),
      'blog/rss.xml': '<rss/>',
      'blog/atom.xml': '<feed/>',
      'blog/2025/06/26/native-decorators-simpler-modules/index.html':
        page('lightspeed'),
      'blog/tags/release/index.html': page('tag'),
      'blog/archive/index.html': page('archive'),
      'blog/authors/evanion/index.html': page('author'),
      'docs/getting-started/index.html': page('0.3 getting started'),
    }),
    snapshotArchive: tree('snapshot-archive', {
      'index.html': page('0.3 archive'),
      'docs/getting-started/index.html': page('0.3 archived getting started'),
    }),
    nextOut: tree('next-out', {
      'index.html': page('next'),
      '404.html': page('next not found'),
      'getting-started.md': '# Getting started',
    }),
    rootOut: tree('root-out', {
      'index.html': page('release'),
      '404.html': page('release not found'),
      'blog/index.html': page('blog'),
      'blog/rss.xml': '<rss>release</rss>',
      'blog/atom.xml': '<feed/>',
    }),
    legacyPosts: [
      {
        legacyUrl: '/blog/2025/06/26/native-decorators-simpler-modules',
        slug: 'native-decorators-simpler-modules',
      },
    ],
  };
}

const read = (site, path) => readFileSync(join(site, path), 'utf8');

describe('assemble in snapshot-only mode', () => {
  it('serves the snapshot root and nothing under next/ or v0.3/', () => {
    const input = inputs();
    assemble({ ...input, mode: 'snapshot-only' });
    expect(read(input.site, 'index.html')).toContain('0.3 root');
    expect(existsSync(join(input.site, 'next'))).toBe(false);
    expect(existsSync(join(input.site, 'v0.3'))).toBe(false);
    expect(read(input.site, 'CNAME')).toBe('nexus.js.org\n');
    expect(existsSync(join(input.site, '.nojekyll'))).toBe(true);
  });
});

describe('assemble in rc mode', () => {
  it('adds the new site under next/', () => {
    const input = inputs();
    assemble({ ...input, mode: 'rc' });
    expect(read(input.site, 'next/index.html')).toContain('next');
    expect(read(input.site, 'next/getting-started.md')).toBe(
      '# Getting started',
    );
  });

  it('sends a missing /next/ path to the new site 404 page', () => {
    const input = inputs();
    assemble({ ...input, mode: 'rc' });
    const html = read(input.site, '404.html');
    expect(html).toContain(rootNotFoundScript());
    expect(html.indexOf(rootNotFoundScript())).toBeLessThan(
      html.indexOf('<title>'),
    );
    expect(html).toContain('0.3 not found');
  });

  it('refuses a snapshot that carries a next/ directory', () => {
    const input = inputs();
    mkdirSync(join(input.snapshotRoot, 'next'));
    expect(() => assemble({ ...input, mode: 'rc' })).toThrow(
      'the snapshot root already has a next/ directory',
    );
  });

  it('removes a CNAME the builds left below the root', () => {
    const input = inputs();
    writeFileSync(join(input.nextOut, 'CNAME'), 'nexus.js.org');
    assemble({ ...input, mode: 'rc' });
    expect(existsSync(join(input.site, 'next/CNAME'))).toBe(false);
  });
});

describe('assemble in final mode', () => {
  it('puts the release build at the root and the archive under v0.3/', () => {
    const input = inputs();
    assemble({ ...input, mode: 'final' });
    expect(read(input.site, 'index.html')).toContain('release');
    expect(read(input.site, '404.html')).toContain('release not found');
    expect(read(input.site, 'v0.3/index.html')).toContain('0.3 archive');
  });

  it('writes a stub for every 0.3 docs page', () => {
    const input = inputs();
    assemble({ ...input, mode: 'final' });
    expect(read(input.site, 'docs/getting-started/index.html')).toBe(
      stubHtml('/v0.3/docs/getting-started/'),
    );
  });

  it('writes a stub for each legacy post URL', () => {
    const input = inputs();
    assemble({ ...input, mode: 'final' });
    expect(
      read(
        input.site,
        'blog/2025/06/26/native-decorators-simpler-modules/index.html',
      ),
    ).toBe(stubHtml('/blog/native-decorators-simpler-modules/'));
  });

  it('sends the old tag, archive and author pages to /blog/', () => {
    const input = inputs();
    assemble({ ...input, mode: 'final' });
    for (const path of [
      'blog/tags/release/index.html',
      'blog/archive/index.html',
      'blog/authors/evanion/index.html',
    ]) {
      expect(read(input.site, path)).toBe(stubHtml('/blog/'));
    }
  });

  it('keeps the new site feeds at the old feed paths', () => {
    const input = inputs();
    assemble({ ...input, mode: 'final' });
    expect(read(input.site, 'blog/rss.xml')).toBe('<rss>release</rss>');
  });
});

describe('assemble in retired mode', () => {
  it('turns every v0.3 page into a stub to /upgrade/', () => {
    const input = inputs();
    assemble({ ...input, mode: 'retired' });
    expect(read(input.site, 'v0.3/index.html')).toBe(stubHtml('/upgrade/'));
    expect(read(input.site, 'v0.3/docs/getting-started/index.html')).toBe(
      stubHtml('/upgrade/'),
    );
  });
});

describe('stubHtml', () => {
  it('refreshes, names the canonical URL and carries a visible link', () => {
    const html = stubHtml('/v0.3/docs/intro/');
    expect(html).toContain(
      '<meta http-equiv="refresh" content="0; url=/v0.3/docs/intro/">',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://nexus.js.org/v0.3/docs/intro/">',
    );
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<a href="/v0.3/docs/intro/">');
  });
});
