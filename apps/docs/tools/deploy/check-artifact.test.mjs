// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkArtifact, siteCounts } from './check-artifact.mjs';
import { rootNotFoundScript, stubHtml } from './assemble.mjs';

const page = (body, head = '') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

function artifact(files) {
  const site = mkdtempSync(join(tmpdir(), 'artifact-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(site, path)), { recursive: true });
    writeFileSync(join(site, path), body);
  }
  return site;
}

const common = {
  CNAME: 'nexus.js.org\n',
  '.nojekyll': '',
  'index.html': page('root'),
};

const snapshotOnly = () => ({
  ...common,
  '404.html': page('0.3 not found'),
  'blog/rss.xml': '<rss/>',
  'blog/atom.xml': '<feed/>',
});

const nextFiles = {
  'next/index.html': page('next'),
  'next/404.html': page('next not found'),
  'next/_pagefind/pagefind.js': 'export {}',
  'next/getting-started.md': '# Getting started',
  'next/runtime/types-0123abcd.json': '{}',
  'next/runtime/core-0123abcd/index.js': 'export {}',
};

const rc = () => ({
  ...snapshotOnly(),
  '404.html': page('0.3 not found', rootNotFoundScript()),
  ...nextFiles,
});

const final = () => ({
  ...common,
  '404.html': page('release not found'),
  'blog/index.html': page('blog'),
  'blog/rss.xml': '<rss/>',
  'blog/atom.xml': '<feed/>',
  'blog/0-4-release-candidate/index.html': page('post'),
  ...nextFiles,
  'v0.3/index.html': page(
    '<a href="/v0.3/docs/">docs</a><img src="/v0.3/img/logo.svg">',
    '<meta name="robots" content="noindex">',
  ),
  'v0.3/docs/index.html': page(
    '<a href="https://github.com/NexusDI/core">GitHub</a>',
    '<meta name="robots" content="noindex, nofollow">',
  ),
});

describe('checkArtifact on clean artifacts', () => {
  it.each([
    ['snapshot-only', snapshotOnly],
    ['rc', rc],
    ['final', final],
  ])('passes a clean %s artifact', (mode, files) => {
    expect(
      checkArtifact(artifact(files()), mode, {
        posts: ['0-4-release-candidate'],
      }),
    ).toEqual([]);
  });

  it('passes a clean retired artifact', () => {
    const files = {
      ...final(),
      'v0.3/index.html': stubHtml('/upgrade/'),
      'v0.3/docs/index.html': stubHtml('/upgrade/'),
    };
    expect(
      checkArtifact(artifact(files), 'retired', {
        posts: ['0-4-release-candidate'],
      }),
    ).toEqual([]);
  });
});

describe('checkArtifact fails when a required file is missing', () => {
  const cases = [
    [
      'snapshot-only',
      snapshotOnly,
      ['.nojekyll', 'index.html', '404.html', 'blog/rss.xml', 'blog/atom.xml'],
    ],
    [
      'rc',
      rc,
      [
        'next/index.html',
        'next/404.html',
        'next/_pagefind/pagefind.js',
        'next/getting-started.md',
        'blog/rss.xml',
        'blog/atom.xml',
      ],
    ],
    [
      'final',
      final,
      [
        'blog/atom.xml',
        'blog/rss.xml',
        'blog/index.html',
        'v0.3/index.html',
        'blog/0-4-release-candidate/index.html',
      ],
    ],
  ];

  for (const [mode, files, required] of cases) {
    for (const path of required) {
      it(`fails ${mode} without ${path}`, () => {
        const site = artifact(files());
        rmSync(join(site, path));
        expect(
          checkArtifact(site, mode, { posts: ['0-4-release-candidate'] }),
        ).toContain(`missing from the ${mode} artifact: ${path}`);
      });
    }
  }

  it('fails rc without a declarations JSON', () => {
    const site = artifact(rc());
    rmSync(join(site, 'next/runtime/types-0123abcd.json'));
    expect(checkArtifact(site, 'rc')).toContain(
      'missing from the rc artifact: next/runtime/types-*.json',
    );
  });

  it('fails rc without a core runtime copy', () => {
    const site = artifact(rc());
    rmSync(join(site, 'next/runtime/core-0123abcd'), { recursive: true });
    expect(checkArtifact(site, 'rc')).toContain(
      'missing from the rc artifact: next/runtime/core-*/index.js',
    );
  });
});

describe('checkArtifact rules beyond presence', () => {
  it('fails a CNAME that names another domain', () => {
    const site = artifact({ ...snapshotOnly(), CNAME: 'example.com\n' });
    expect(checkArtifact(site, 'snapshot-only')).toContain(
      'CNAME reads "example.com", and the site is nexus.js.org.',
    );
  });

  it('fails a missing CNAME', () => {
    const site = artifact(snapshotOnly());
    rmSync(join(site, 'CNAME'));
    expect(checkArtifact(site, 'snapshot-only')).toContain(
      'missing from the snapshot-only artifact: CNAME',
    );
  });

  it('fails a CNAME below the root', () => {
    const site = artifact({ ...rc(), 'next/CNAME': 'nexus.js.org' });
    expect(checkArtifact(site, 'rc')).toContain(
      'next/CNAME: only the root carries a CNAME.',
    );
  });

  it('fails next/ in snapshot-only mode', () => {
    const site = artifact({
      ...snapshotOnly(),
      'next/index.html': page('next'),
    });
    expect(checkArtifact(site, 'snapshot-only')).toContain(
      'next/ exists in snapshot-only mode, which deploys the snapshot alone.',
    );
  });

  it('fails a blog under next/', () => {
    const site = artifact({ ...rc(), 'next/blog/index.html': page('blog') });
    expect(checkArtifact(site, 'rc')).toContain(
      'next/blog/ exists. The /next/ build leaves content/blog/ out.',
    );
  });

  it('fails an rc root 404 without the /next/ script', () => {
    const site = artifact({ ...rc(), '404.html': page('0.3 not found') });
    expect(checkArtifact(site, 'rc')).toContain(
      '404.html does not carry the script that sends a missing /next/ path to /next/404.html.',
    );
  });

  it('fails a v0.3 page without noindex', () => {
    const site = artifact({ ...final(), 'v0.3/docs/index.html': page('docs') });
    expect(
      checkArtifact(site, 'final', { posts: ['0-4-release-candidate'] }),
    ).toContain('v0.3/docs/index.html: carries no noindex robots meta.');
  });

  it('fails a v0.3 link that leaves the archive', () => {
    const site = artifact({
      ...final(),
      'v0.3/docs/index.html': page(
        '<a href="/docs/intro">intro</a>',
        '<meta name="robots" content="noindex">',
      ),
    });
    expect(
      checkArtifact(site, 'final', { posts: ['0-4-release-candidate'] }),
    ).toContain(
      'v0.3/docs/index.html: href "/docs/intro" is root-relative outside /v0.3/.',
    );
  });

  it('fails a retired v0.3 page that is not a stub', () => {
    const site = artifact({
      ...final(),
      'v0.3/docs/index.html': stubHtml('/upgrade/'),
    });
    expect(
      checkArtifact(site, 'retired', { posts: ['0-4-release-candidate'] }),
    ).toContain(
      'v0.3/index.html: retired mode serves redirect stubs under /v0.3/.',
    );
  });
});

describe('siteCounts', () => {
  it('counts the root, next/ and v0.3/ apart', () => {
    expect(siteCounts(artifact(final()))).toEqual({
      root: 8,
      next: 6,
      'v0.3': 2,
    });
  });
});
