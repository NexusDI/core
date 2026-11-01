// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BAY_MARK,
  CSS_BUDGET,
  FIRST_LOAD_JS,
  FONT_FILE_BUDGET,
  GIANT_ASSET,
  HERO_BUDGET,
  HTML_BUDGET,
  LIGHT_MARK,
  RUNTIME_MARK,
  assetsOf,
  checkAssets,
  checkPages,
  classify,
  elementsOf,
  fontsOf,
  heroOf,
  importGroups,
  measureBehaviour,
  measureLazyChunks,
  measurePages,
  reportLines,
  routeType,
} from './check-budgets.mjs';

const dirs = [];
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

/** Random base64 gzips to about three quarters of its length, so sizes are predictable. */
function noise(gzippedBytes) {
  return `/*${randomBytes(Math.ceil(gzippedBytes)).toString('base64')}*/`;
}

function exportDir() {
  const out = mkdtempSync(join(tmpdir(), 'budgets-'));
  dirs.push(out);
  return out;
}

function write(out, path, content) {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), content);
}

/** A page whose HTML names `scripts`, `styles` and the preloaded `fonts`, under /next. */
function html({
  scripts = [],
  noModule = [],
  styles = [],
  fonts = [],
  body = '',
}) {
  return `<html><head>${fonts
    .map(
      (font) =>
        `<link rel="preload" href="/next/_next/static/media/${font}" as="font" crossorigin="" type="font/woff2"/>`,
    )
    .join('')}${styles
    .map(
      (style) =>
        `<link rel="stylesheet" href="/next/${style}" data-precedence="next"/>`,
    )
    .join('')}${scripts
    .map(
      (src) =>
        `<script src="/next/_next/static/chunks/${src}" async=""></script>`,
    )
    .join('')}${noModule
    .map(
      (src) =>
        `<script src="/next/_next/static/chunks/${src}" noModule=""></script>`,
    )
    .join('')}</head><body>${body}</body></html>`;
}

/** The hero picture of the front page, with its sources and the high-priority image. */
const HERO_PICTURE =
  '<picture><source type="image/avif" srcSet="/next/_next/static/media/hero-1024.avif 1024w, /next/_next/static/media/hero-1536.avif 1536w"/><img src="/next/_next/static/media/hero-1536.webp" fetchPriority="high" alt=""/></picture>';

/** An export of a front page, a guide, the API pages and the Playground. */
function site({
  guideBytes = 1000,
  toolBytes = 1000,
  apiHtml = '',
  fontBytes = 1000,
  heroBytes = 1000,
  hero = HERO_PICTURE,
  cssBytes = 3,
  noModuleBytes = 0,
} = {}) {
  const out = exportDir();
  const chunk = (name, text) => write(out, `_next/static/chunks/${name}`, text);
  chunk('shared.js', noise(5_000));
  chunk('guide.js', noise(guideBytes));
  chunk('playground.js', noise(toolBytes));
  chunk('legacy.js', noise(noModuleBytes));
  write(out, '_next/static/chunks/site.css', 'a{}'.repeat(cssBytes / 3));
  write(out, 'code-classes.css', 'b{}');
  write(out, '_next/static/media/plex.woff2', randomBytes(fontBytes));
  for (const name of ['hero-1024.avif', 'hero-1536.avif', 'hero-1536.webp'])
    write(out, `_next/static/media/${name}`, randomBytes(heroBytes));
  const common = {
    styles: ['_next/static/chunks/site.css', 'code-classes.css'],
    fonts: ['plex.woff2'],
    noModule: ['legacy.js'],
  };
  write(
    out,
    'index.html',
    html({ ...common, scripts: ['shared.js'], body: hero }),
  );
  write(
    out,
    'scopes/index.html',
    html({ ...common, scripts: ['shared.js', 'guide.js'] }),
  );
  write(
    out,
    'api/index.html',
    html({ ...common, scripts: ['shared.js'], body: apiHtml }),
  );
  write(
    out,
    'api-react/index.html',
    html({ ...common, scripts: ['shared.js'] }),
  );
  write(
    out,
    'playground/index.html',
    html({ ...common, scripts: ['shared.js', 'playground.js'] }),
  );
  // The error pages skip the theme chunk, as in the real export.
  write(out, '404/index.html', html({ scripts: [] }));
  write(out, '_not-found/index.html', html({ scripts: [] }));
  return out;
}

describe('routeType', () => {
  it('sorts a page by its path', () => {
    expect(routeType('index.html')).toBe('front');
    expect(routeType('api/index.html')).toBe('api');
    expect(routeType('api-react/index.html')).toBe('api');
    expect(routeType('api-errors-package/index.html')).toBe('api');
    expect(routeType('playground/index.html')).toBe('tool');
    expect(routeType('academy/one/index.html')).toBe('tool');
    expect(routeType('scopes/index.html')).toBe('guide');
  });
});

describe('assetsOf, fontsOf and heroOf', () => {
  it('reads every script and stylesheet a page loads, from any path', () => {
    expect(
      assetsOf(
        '<link rel="stylesheet" href="/next/_next/x.css"/><link rel="stylesheet" href="/next/code-classes.css?dpl=1"/><link rel="preload" href="/next/_next/p.css" as="style"/><script src="/next/_next/y.js"></script><script src="https://cdn/z.js"></script><script src="/next/_next/old.js" noModule=""></script>',
        '/next',
      ),
    ).toEqual({
      scripts: ['/_next/y.js'],
      noModule: ['/_next/old.js'],
      styles: ['/_next/x.css', '/code-classes.css'],
    });
  });

  it('reads the fonts a page preloads and nothing else', () => {
    expect(
      fontsOf(
        '<link rel="preload" href="/next/_next/static/media/a.woff2" as="font"/><link rel="preload" href="/next/_next/static/media/b.png" as="image"/>',
        '/next',
      ),
    ).toEqual(['/_next/static/media/a.woff2']);
  });

  it('reads the srcset and src of the high-priority picture only', () => {
    const other =
      '<picture><source srcSet="/next/_next/static/media/side.avif 1w"/><img src="/next/_next/static/media/side.webp"/></picture>';
    expect(heroOf(other + HERO_PICTURE, '/next')).toEqual([
      '/_next/static/media/hero-1024.avif',
      '/_next/static/media/hero-1536.avif',
      '/_next/static/media/hero-1536.webp',
    ]);
    expect(heroOf(other, '/next')).toEqual([]);
  });
});

describe('measurePages and checkPages', () => {
  it('passes an export inside every ceiling', () => {
    const rows = measurePages(site(), { basePath: '/next' });
    expect(rows.map((row) => row.path)).toEqual([
      'api-react/index.html',
      'api/index.html',
      'index.html',
      'playground/index.html',
      'scopes/index.html',
    ]);
    expect(checkPages(rows)).toEqual([]);
    expect(checkAssets(site(), { basePath: '/next' })).toEqual([]);
  });

  it('counts the shared chunks in a page first-load JavaScript', () => {
    const rows = measurePages(site({ guideBytes: 5_000 }), {
      basePath: '/next',
    });
    const front = rows.find((row) => row.type === 'front');
    const guide = rows.find((row) => row.type === 'guide');
    expect(guide.js.gzip - front.js.gzip).toBeGreaterThan(4_000);
    expect(front.js.gzip).toBeGreaterThan(4_000);
  });

  it('fails a guide over its first-load ceiling and names the page', () => {
    const findings = checkPages(
      measurePages(site({ guideBytes: FIRST_LOAD_JS.guide }), {
        basePath: '/next',
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(
      /^scopes\/index\.html: guide first-load JavaScript is \d+\.\d kB gzipped, over the 310 kB ceiling/,
    );
  });

  it('fails stylesheets over the render-blocking ceiling, /code-classes.css included', () => {
    const out = site();
    write(out, 'code-classes.css', noise(CSS_BUDGET));
    const findings = checkPages(measurePages(out, { basePath: '/next' }));
    expect(findings).toHaveLength(5);
    expect(findings[0]).toMatch(
      /the stylesheets are .* over the 34 kB ceiling/,
    );
  });

  it('fails a page whose HTML names no scripts and no stylesheets', () => {
    const out = site();
    write(out, 'empty/index.html', '<html><body></body></html>');
    const findings = checkPages(measurePages(out, { basePath: '/next' }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(
      /^empty\/index\.html: the HTML names 0 scripts and 0 stylesheets/,
    );
  });

  it('fails the assets a wrong base path leaves unfound', () => {
    const findings = checkPages(measurePages(site(), { basePath: '/wrong' }));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.join('\n')).toMatch(/which the export does not hold/);
  });

  it('keeps nomodule scripts out of first-load and reports them apart', () => {
    const out = site({ noModuleBytes: FIRST_LOAD_JS.guide });
    const rows = measurePages(out, { basePath: '/next' });
    expect(checkPages(rows)).toEqual([]);
    expect(rows[0].noModule.gzip).toBeGreaterThan(FIRST_LOAD_JS.guide - 1_000);
    expect(reportLines(out, rows).join('\n')).toMatch(
      /nomodule scripts, which modern browsers skip, are up to \d+\.\d kB/,
    );
  });

  it('holds a tool page to its own ceiling, above the content ceiling', () => {
    const over = (limit) =>
      checkPages(
        measurePages(site({ toolBytes: limit }), { basePath: '/next' }),
      );
    expect(over(395_000)).toEqual([]);
    const findings = over(FIRST_LOAD_JS.tool);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(
      /^playground\/index\.html: tool first-load JavaScript .* over the 440 kB ceiling/,
    );
  });

  it('holds a package API page to the api row', () => {
    const rows = measurePages(site(), { basePath: '/next' });
    expect(rows.find((row) => row.path === 'api-react/index.html').type).toBe(
      'api',
    );
  });

  it('fails a page whose HTML gzips past the ceiling, and ignores its element count', () => {
    const findings = checkPages(
      measurePages(site({ apiHtml: noise(HTML_BUDGET) }), {
        basePath: '/next',
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/^api\/index\.html: the page's HTML is/);
    const many = checkPages(
      measurePages(site({ apiHtml: '<div></div>'.repeat(30_000) }), {
        basePath: '/next',
      }),
    );
    expect(many).toEqual([]);
  });

  it('fails a preloaded font over its ceiling once', () => {
    const findings = checkPages(
      measurePages(site({ fontBytes: FONT_FILE_BUDGET + 1 }), {
        basePath: '/next',
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(
      /^\/_next\/static\/media\/plex\.woff2: the preloaded font/,
    );
  });

  it('counts the elements outside scripts', () => {
    expect(
      elementsOf('<html><body><p>a</p><script>"<b><i>"</script></body></html>'),
    ).toBe(3);
  });

  it('skips a script closed with a space before its >, or never closed', () => {
    expect(elementsOf('<p>a</p><script>"<b>"</script ><i>b</i>')).toBe(2);
    expect(elementsOf('<p>a</p><script>"<b><i>"')).toBe(1);
  });
});

describe('checkAssets', () => {
  it('fails a front page with no high-priority picture', () => {
    const findings = checkAssets(site({ hero: '<img src="/x.png"/>' }), {
      basePath: '/next',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(
      /no <picture> holds an <img fetchpriority="high">/,
    );
  });

  it('fails a hero image over its ceiling, whatever its name', () => {
    const findings = checkAssets(site({ heroBytes: HERO_BUDGET + 1 }), {
      basePath: '/next',
    });
    expect(findings).toHaveLength(3);
    expect(findings.join('\n')).toMatch(/hero-1024\.avif: the hero image is/);
  });

  it('fails a hero avif alone over its ceiling', () => {
    const out = site();
    write(
      out,
      '_next/static/media/hero-1536.avif',
      randomBytes(HERO_BUDGET + 1),
    );
    const findings = checkAssets(out, { basePath: '/next' });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/^\/_next\/static\/media\/hero-1536\.avif/);
  });

  it('does not hold an image outside the hero to the hero ceiling', () => {
    const out = site();
    write(out, '_next/static/media/side.avif', randomBytes(HERO_BUDGET + 1));
    expect(checkAssets(out, { basePath: '/next' })).toEqual([]);
  });

  it.each([
    'avif',
    'webp',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'svg',
    'ico',
    'woff',
    'woff2',
    'ttf',
    'otf',
    'eot',
  ])('fails a .%s file over the giant guard, wherever it sits', (extension) => {
    const out = site();
    write(out, `public/big.${extension}`, randomBytes(GIANT_ASSET + 1));
    write(out, 'data.json', randomBytes(GIANT_ASSET + 1));
    const findings = checkAssets(out, { basePath: '/next' });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(new RegExp(`^public/big\\.${extension}:`));
  });
});

describe('the report rows', () => {
  /** An export with every report row oversized and no gate row over. */
  function heavy() {
    const out = site({
      apiHtml: '<div></div>'.repeat(30_000),
      noModuleBytes: 80_000,
    });
    write(
      out,
      'behaviour/core/Nexus.json',
      `{"html":"${'a'.repeat(5_000_000)}"}`,
    );
    const chunk = (name, text) =>
      write(out, `_next/static/chunks/${name}`, text);
    chunk('bay.js', `const m="${BAY_MARK}";${noise(40_000)}`);
    chunk('runtime.js', `const m="${RUNTIME_MARK}";${noise(60_000)}`);
    chunk('light.js', `const m="${LIGHT_MARK}";${noise(300_000)}`);
    chunk(
      'loaders.js',
      'push([void 0,1,e=>{e.v(i=>Promise.all(["static/chunks/bay.js"].map(i=>e.l(i))))},2,e=>{e.v(i=>Promise.all(["static/chunks/runtime.js"].map(i=>e.l(i))))},3,e=>{e.v(i=>Promise.all(["static/chunks/light.js"].map(i=>e.l(i))))}])',
    );
    return out;
  }

  const cli = (out, env = {}) =>
    spawnSync(
      process.execPath,
      [join(import.meta.dirname, 'check-budgets.mjs')],
      {
        encoding: 'utf8',
        env: { ...process.env, DOCS_OUT: out, DOCS_BASE_PATH: '/next', ...env },
      },
    );

  it('measures the sidecars, largest first', () => {
    const out = heavy();
    write(out, 'behaviour/core/Small.json', '{}');
    expect(measureBehaviour(out).map((row) => row.path)).toEqual([
      'behaviour/core/Nexus.json',
      'behaviour/core/Small.json',
    ]);
  });

  it('exits 0 with every report row oversized, and prints them', () => {
    const run = cli(heavy());
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/bay controller [4-9]\d\.\d kB/);
    expect(run.stdout).toMatch(/core runtime/);
    expect(run.stdout).toMatch(/bay light/);
    expect(run.stdout).toMatch(/behaviour sidecars.*5000\.\d kB raw/);
    expect(run.stdout).toMatch(/most elements is .*: 30\d{3} elements/);
    expect(run.stdout).toMatch(/nomodule scripts, .* 8\d\.\d kB/);
  });

  it('prints a note for a route type with no pages', () => {
    const out = heavy();
    rmSync(join(out, 'playground'), { recursive: true });
    expect(cli(out).stdout).toMatch(/tool: no pages in this build/);
  });

  const gates = {
    'first-load JavaScript': (out) =>
      write(out, '_next/static/chunks/guide.js', noise(FIRST_LOAD_JS.guide)),
    stylesheets: (out) => write(out, 'code-classes.css', noise(CSS_BUDGET)),
    'the HTML document': (out) =>
      write(
        out,
        'api/index.html',
        html({
          scripts: ['shared.js'],
          styles: ['_next/static/chunks/site.css'],
          body: noise(HTML_BUDGET),
        }),
      ),
    'a preloaded font': (out) =>
      write(
        out,
        '_next/static/media/plex.woff2',
        randomBytes(FONT_FILE_BUDGET + 1),
      ),
    'the hero image': (out) =>
      write(
        out,
        '_next/static/media/hero-1536.avif',
        randomBytes(HERO_BUDGET + 1),
      ),
    'a giant asset': (out) =>
      write(out, 'public/big.jpg', randomBytes(GIANT_ASSET + 1)),
    'a page that loses its assets': () => {},
  };

  it.each(Object.keys(gates))('exits 1 when %s is over', (gate) => {
    const out = site();
    gates[gate](out);
    const run = cli(
      out,
      gate === 'a page that loses its assets'
        ? { DOCS_BASE_PATH: '/wrong' }
        : {},
    );
    expect(run.status).toBe(1);
  });

  it('exits 0 on the unmodified fixture', () => {
    expect(cli(site()).status).toBe(0);
  });
});

describe('classify', () => {
  it('sorts a chunk by the marker it carries', () => {
    expect(classify(`x="${BAY_MARK}"`)).toBe('bay');
    expect(classify(`x="${LIGHT_MARK}"`)).toBe('light');
    expect(classify(`x="${RUNTIME_MARK}"`)).toBe('runtime');
    expect(classify('const nothing = 1')).toBe('page');
  });
});

describe('importGroups', () => {
  it("reads the chunk lists of Turbopack's import() loaders", () => {
    const source =
      'push([void 0,11,e=>{e.v(i=>Promise.all(["static/chunks/a.js","static/chunks/b.js"].map(i=>e.l(i))).then(()=>i(1)))},12,e=>{e.v(i=>Promise.all(["static/chunks/c.js"].map(i=>e.l(i))))}])';
    expect(importGroups([source])).toEqual([
      ['static/chunks/a.js', 'static/chunks/b.js'],
      ['static/chunks/c.js'],
    ]);
  });

  it('reads a long list and an unclosed list in linear time', () => {
    const closed = `Promise.all([""${' ""'.repeat(50_000)}])`;
    const unclosed = `Promise.all([""${' ""'.repeat(50_000)}`;
    const started = performance.now();
    expect(importGroups([closed, unclosed])).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('skips a list that holds anything besides quoted names', () => {
    expect(
      importGroups([
        'Promise.all(["a.js", x[0],"b.js"])',
        'Promise.all([f("a.js")])',
        'Promise.all([x,"a.js"])',
      ]),
    ).toEqual([]);
  });
});

describe('measureLazyChunks', () => {
  /**
   * An export with the loader chunk that lists each `import()` group, as
   * Turbopack writes it, and the chunks and media the groups name.
   */
  function lazySite({ chunks, groups, media = {} }) {
    const out = mkdtempSync(join(tmpdir(), 'budgets-lazy-'));
    dirs.push(out);
    mkdirSync(join(out, '_next', 'static', 'chunks'), { recursive: true });
    mkdirSync(join(out, '_next', 'static', 'media'), { recursive: true });
    const loaders = groups
      .map(
        (list, at) =>
          `${at},e=>{e.v(i=>Promise.all([${list.map((name) => `"static/chunks/${name}"`).join(',')}].map(i=>e.l(i))))}`,
      )
      .join(',');
    writeFileSync(
      join(out, '_next', 'static', 'chunks', 'loaders.js'),
      `push([void 0,${loaders}])`,
    );
    for (const [name, text] of Object.entries(chunks))
      writeFileSync(join(out, '_next', 'static', 'chunks', name), text);
    for (const [name, bytes] of Object.entries(media))
      writeFileSync(
        join(out, '_next', 'static', 'media', name),
        randomBytes(bytes),
      );
    return out;
  }
  const mark = (value, bytes) => `const m="${value}";${noise(bytes)}`;
  const base = (over = {}) => ({
    chunks: {
      'bay.js': mark(BAY_MARK, 1_000),
      'runtime.js': mark(RUNTIME_MARK, 1_000),
      'light.js': mark(LIGHT_MARK, 1_000),
      ...over.chunks,
    },
    groups: over.groups ?? [['bay.js'], ['runtime.js'], ['light.js']],
    media: over.media,
  });

  it('measures the three rows, which no page names', () => {
    const { notes, rows } = measureLazyChunks(lazySite(base()));
    expect(notes).toEqual([]);
    expect(rows.map((row) => row.row)).toEqual(['bay', 'runtime', 'light']);
  });

  it('reports a large row and never fails it', () => {
    const { notes, rows } = measureLazyChunks(
      lazySite(
        base({
          chunks: {
            'bay.js': mark(BAY_MARK, 23_000),
            'runtime.js': mark(RUNTIME_MARK, 33_000),
          },
        }),
      ),
    );
    expect(notes).toEqual([]);
    expect(rows[0].gzip).toBeGreaterThan(22_000);
    expect(rows[1].gzip).toBeGreaterThan(32_000);
  });

  it('counts an unmarked chunk in the group of the marked one, once in each group that lists it', () => {
    const { rows } = measureLazyChunks(
      lazySite(
        base({
          chunks: {
            'runtime.js': mark(RUNTIME_MARK, 16_000),
            'light.js': mark(LIGHT_MARK, 16_000),
            'core.js': noise(16_000),
          },
          groups: [
            ['bay.js'],
            ['runtime.js', 'core.js'],
            ['light.js', 'core.js'],
          ],
        }),
      ),
    );
    expect(rows[1].chunks.map((chunk) => chunk.split).sort()).toEqual([
      false,
      true,
    ]);
    expect(rows[2].chunks.map((chunk) => chunk.split).sort()).toEqual([
      false,
      true,
    ]);
    expect(rows[1].gzip).toBeGreaterThan(32_000);
    expect(rows[2].gzip).toBeGreaterThan(32_000);
  });

  it('leaves out an unmarked chunk that no group lists with the marked one', () => {
    const { notes, rows } = measureLazyChunks(
      lazySite(base({ chunks: { 'stray.js': noise(60_000) } })),
    );
    expect(notes).toEqual([]);
    expect(rows[0].chunks.map((chunk) => chunk.file)).toEqual([
      '_next/static/chunks/bay.js',
    ]);
  });

  it('counts the mask PNGs that the light group emits', () => {
    const { rows } = measureLazyChunks(
      lazySite(
        base({
          chunks: {
            'masks.js': 'e.q("/next/_next/static/media/rooms.1a2b.png")',
            'light.js': mark(LIGHT_MARK, 100_000),
          },
          groups: [['bay.js'], ['runtime.js'], ['light.js', 'masks.js']],
          media: { 'rooms.1a2b.png': 60_000 },
        }),
      ),
    );
    expect(rows[2].media).toBe(60_000);
    expect(rows[2].gzip).toBeGreaterThan(160_000);
  });

  it('notes a row with no marked chunk, so a minifier that drops a marker is seen', () => {
    const { notes } = measureLazyChunks(
      lazySite({
        chunks: { 'bay.js': mark(BAY_MARK, 1_000), 'other.js': noise(1_000) },
        groups: [['bay.js'], ['other.js']],
      }),
    );
    expect(notes).toHaveLength(2);
    expect(notes.join(' ')).toContain(RUNTIME_MARK);
    expect(notes.join(' ')).toContain(LIGHT_MARK);
  });
});

describe('the docs build', () => {
  const built = join(import.meta.dirname, '..', 'out');

  it.skipIf(!existsSync(join(built, '_next', 'static')))(
    'finds the bay controller, the run chunk and the light chunk, and passes every gate row',
    () => {
      const { notes, rows } = measureLazyChunks(built);
      expect(notes).toEqual([]);
      expect(rows.every((row) => row.chunks.length >= 1)).toBe(true);
      expect(
        checkPages(
          measurePages(built, { basePath: process.env.DOCS_BASE_PATH ?? '' }),
        ),
      ).toEqual([]);
      expect(
        checkAssets(built, { basePath: process.env.DOCS_BASE_PATH ?? '' }),
      ).toEqual([]);
    },
  );
});
