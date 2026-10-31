// @vitest-environment node
import { randomBytes } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BACKGROUND_MARK,
  BAY_MARK,
  LIGHT_MARK,
  RUNTIME_MARK,
  checkMarkedChunks,
  importGroups,
  classify,
  BEHAVIOUR_BUDGET,
  BUDGETS,
  GUIDE_BUDGET,
  GUIDE_PAGE,
  GUIDE_SLACK,
  PAGE_BUDGET,
  assetsOf,
  checkPages,
  elementsOf,
  checkGuideTotal,
  ISLAND_MARK,
  checkBehaviour,
  checkBudgets,
  checkArt,
  checkFonts,
  ART_BUDGET,
  ART_DIR,
  ART_SUM,
  CONDENSED_FONTS,
  FONT_BUDGET,
  scriptsOf,
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

function page(scripts) {
  return `<html><head>${scripts
    .map(
      (src) =>
        `<script src="/next/_next/static/chunks/${src}" async=""></script>`,
    )
    .join('')}</head><body></body></html>`;
}

/** An export with a shared chunk, a landing page, a concept page and the Playground. */
function site({
  contentBytes,
  islandBytes = 1000,
  backgroundBytes = 1000,
  toolBytes = 1000,
}) {
  const out = mkdtempSync(join(tmpdir(), 'budgets-'));
  dirs.push(out);
  const write = (path, text) => {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), text);
  };
  const chunk = (name, text) => write(`_next/static/chunks/${name}`, text);

  chunk('shared.js', noise(5_000));
  chunk('theme.js', noise(50_000));
  chunk('tokens.js', noise(contentBytes));
  chunk('island.js', `const mark="${ISLAND_MARK}";${noise(islandBytes)}`);
  chunk(
    'background.js',
    `canvas.dataset.module="${BACKGROUND_MARK}";${noise(backgroundBytes)}`,
  );
  chunk('playground.js', noise(toolBytes));

  write('index.html', page(['shared.js', 'theme.js', 'background.js']));
  write(
    'tokens/index.html',
    page(['shared.js', 'theme.js', 'tokens.js', 'island.js', 'background.js']),
  );
  write(
    'playground/index.html',
    page(['shared.js', 'theme.js', 'playground.js', 'background.js']),
  );
  // The error pages skip the theme chunk, as in the real export.
  write('404/index.html', page(['shared.js']));
  write('_not-found/index.html', page(['shared.js']));
  return out;
}

describe('scriptsOf', () => {
  it('reads each script src and strips the base path', () => {
    expect(scriptsOf(page(['a.js', 'b.js']), '/next')).toEqual([
      '/_next/static/chunks/a.js',
      '/_next/static/chunks/b.js',
    ]);
  });
});

describe('checkBudgets', () => {
  it('passes an export inside every row', () => {
    const { findings } = checkBudgets(site({ contentBytes: 4000 }), {
      basePath: '/next',
    });
    expect(findings).toEqual([]);
  });

  it('fails a content page over its budget and names the page', () => {
    const { findings } = checkBudgets(site({ contentBytes: 14_000 }), {
      basePath: '/next',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(
      /^tokens\/index\.html: content-page JavaScript is \d+\.\d kB gzipped, over the 10 kB budget/,
    );
  });

  it('counts the console island and the background against their own rows', () => {
    const { findings } = checkBudgets(
      site({ contentBytes: 1000, islandBytes: 40_000, backgroundBytes: 9_000 }),
      { basePath: '/next' },
    );
    expect(findings.join('\n')).toMatch(
      /console island is .* over the 35 kB budget/,
    );
    expect(findings.join('\n')).toMatch(
      /background module is .* over the 8 kB budget/,
    );
  });

  it('holds the Playground to the tool row', () => {
    const inside = checkBudgets(
      site({ contentBytes: 1000, toolBytes: 150_000 }),
      {
        basePath: '/next',
      },
    );
    const over = checkBudgets(
      site({ contentBytes: 1000, toolBytes: 220_000 }),
      {
        basePath: '/next',
      },
    );
    expect(inside.findings).toEqual([]);
    expect(over.findings[0]).toMatch(
      /^playground\/index\.html: tool-route JavaScript .* over the 200 kB budget/,
    );
  });

  it('states the rows of spec §16.2 in bytes', () => {
    expect(BUDGETS).toEqual({
      content: 10_000,
      island: 35_000,
      background: 8_000,
      tool: 200_000,
      bay: 20_000,
      runtime: 32_000,
      light: 150_000,
    });
  });
});

describe('checkBehaviour', () => {
  /** An export holding one behaviour sidecar of `text`. */
  function sidecar(text) {
    const out = mkdtempSync(join(tmpdir(), 'budgets-'));
    dirs.push(out);
    mkdirSync(join(out, 'behaviour', 'core'), { recursive: true });
    writeFileSync(join(out, 'behaviour', 'core', 'Nexus.json'), text);
    return out;
  }

  it('passes a sidecar inside both ceilings', () => {
    expect(checkBehaviour(sidecar('{"bodies":{}}')).findings).toEqual([]);
  });

  it('fails a sidecar over the raw ceiling, however well it compresses', () => {
    const { findings } = checkBehaviour(
      sidecar(`{"html":"${'a'.repeat(BEHAVIOUR_BUDGET.raw)}"}`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(
      new RegExp(
        `^behaviour/core/Nexus\\.json: the behaviour sidecar is .* over the ${BEHAVIOUR_BUDGET.raw / 1000} kB raw`,
      ),
    );
  });

  it('fails a sidecar over the gzip ceiling', () => {
    const { findings } = checkBehaviour(
      sidecar(`{"html":"${noise(BEHAVIOUR_BUDGET.gzip)}"}`),
    );
    expect(findings).toHaveLength(1);
  });

  it('names the target to run when the export has no sidecars', () => {
    const out = mkdtempSync(join(tmpdir(), 'budgets-'));
    dirs.push(out);
    expect(checkBehaviour(out).findings[0]).toMatch(
      /@nexusdi\/docs:behaviour-data/,
    );
  });
});

describe('checkGuideTotal', () => {
  /** An export whose guide page loads one script of `bytes` random bytes. */
  function guide(bytes) {
    const out = mkdtempSync(join(tmpdir(), 'budgets-'));
    dirs.push(out);
    mkdirSync(join(out, '_next/static/chunks'), { recursive: true });
    mkdirSync(join(out, dirname(GUIDE_PAGE)), { recursive: true });
    writeFileSync(join(out, '_next/static/chunks/a.js'), randomBytes(bytes));
    writeFileSync(join(out, '_next/static/chunks/a.css'), 'a{}');
    writeFileSync(
      join(out, GUIDE_PAGE),
      '<link rel="stylesheet" href="/next/_next/static/chunks/a.css"><script src="/next/_next/static/chunks/a.js"></script>',
    );
    return out;
  }

  it('reads every script and stylesheet a page loads', () => {
    expect(
      assetsOf(
        '<link href="/next/_next/x.css"><script src="/next/_next/y.js"></script><script src="https://cdn/z.js"></script>',
        '/next',
      ),
    ).toEqual(['/_next/y.js', '/_next/x.css']);
  });

  it('passes a total inside the ratchet', () => {
    const { findings } = checkGuideTotal(
      guide(GUIDE_BUDGET.gzip - GUIDE_SLACK / 2),
      { basePath: '/next' },
    );
    expect(findings).toEqual([]);
  });

  it('fails a total over the ratchet and names the way out', () => {
    const { findings } = checkGuideTotal(guide(GUIDE_BUDGET.gzip + 1_000), {
      basePath: '/next',
    });
    expect(findings[0]).toMatch(/over the .* ratchet\. A component/);
  });

  it('fails a total far enough under the ratchet to lower it', () => {
    const { findings } = checkGuideTotal(guide(GUIDE_BUDGET.gzip / 2), {
      basePath: '/next',
    });
    expect(findings[0]).toMatch(/Lower GUIDE_BUDGET/);
  });
});

describe('checkPages', () => {
  /** An export whose one page holds `elements` divs of `text`. */
  function site(elements, text = '') {
    const out = mkdtempSync(join(tmpdir(), 'budgets-'));
    dirs.push(out);
    mkdirSync(join(out, 'api'), { recursive: true });
    writeFileSync(
      join(out, 'api', 'index.html'),
      `<html><body>${'<div></div>'.repeat(elements)}${text}<script>self.__next_f.push([1,"<div><div><div>"])</script></body></html>`,
    );
    return out;
  }

  it('counts the elements outside scripts', () => {
    expect(
      elementsOf('<html><body><p>a</p><script>"<b><i>"</script></body></html>'),
    ).toBe(3);
  });

  it('skips a script closed with a space before its >, or never closed', () => {
    expect(elementsOf('<p>a</p><script>"<b>"</script ><i>b</i>')).toBe(2);
    expect(elementsOf('<p>a</p><script>"<b><i>"')).toBe(1);
  });

  it('passes a page inside both ceilings', () => {
    expect(checkPages(site(10)).findings).toEqual([]);
  });

  it('fails a page with too many elements', () => {
    expect(checkPages(site(PAGE_BUDGET.elements + 1)).findings[0]).toMatch(
      /^api\/index\.html: the page's HTML is .* over the .* element budget/,
    );
  });

  it('fails a page whose HTML gzips past the ceiling', () => {
    expect(
      checkPages(site(1, noise(PAGE_BUDGET.htmlGzip))).findings,
    ).toHaveLength(1);
  });
});

describe('checkFonts', () => {
  /** An export whose media directory holds copies of `files` under hashed names. */
  function exportWith(files) {
    const out = mkdtempSync(join(tmpdir(), 'budgets-'));
    dirs.push(out);
    const media = join(out, '_next', 'static', 'media');
    mkdirSync(media, { recursive: true });
    files.forEach((bytes, at) =>
      writeFileSync(join(media, `hash${at}.p.woff2`), bytes),
    );
    return out;
  }

  /** Two source files of `size` bytes each, on disk. */
  function sources(size) {
    const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
    dirs.push(dir);
    return [500, 600].map((weight) => {
      const path = join(dir, `condensed-${weight}.woff2`);
      writeFileSync(path, randomBytes(size));
      return path;
    });
  }

  it('measures the real condensed files against the ceiling', () => {
    for (const path of CONDENSED_FONTS) {
      expect(readFileSync(path).length).toBeLessThanOrEqual(
        FONT_BUDGET.perFile,
      );
    }
  });

  it('passes two shipped files inside the ceiling', () => {
    const paths = sources(1000);
    const out = exportWith(paths.map((path) => readFileSync(path)));
    const { findings, rows } = checkFonts(out, { sources: paths });
    expect(findings).toEqual([]);
    expect(rows.map((row) => row.bytes)).toEqual([1000, 1000]);
  });

  it('fails a file the export does not ship', () => {
    const paths = sources(1000);
    const out = exportWith([readFileSync(paths[0])]);
    const { findings } = checkFonts(out, { sources: paths });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/^condensed-600\.woff2: no identical copy/);
  });

  it('fails a file over the ceiling', () => {
    const paths = sources(FONT_BUDGET.perFile + 1);
    const out = exportWith(paths.map((path) => readFileSync(path)));
    const { findings } = checkFonts(out, { sources: paths });
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatch(/over the 20\.5 kB budget/);
  });
});

describe('checkArt', () => {
  /** An export whose media directory holds copies of the art under hashed names. */
  function exportWith(files) {
    const out = mkdtempSync(join(tmpdir(), 'budgets-'));
    dirs.push(out);
    const media = join(out, '_next', 'static', 'media');
    mkdirSync(media, { recursive: true });
    files.forEach((bytes, at) =>
      writeFileSync(join(media, `hash${at}.p.bin`), bytes),
    );
    return out;
  }

  /** Two source files of `size` bytes each, on disk, with a ceiling of `limit`. */
  function sources(size, limit) {
    const dir = mkdtempSync(join(tmpdir(), 'art-'));
    dirs.push(dir);
    const names = ['one.avif', 'two.webp'];
    for (const name of names) writeFileSync(join(dir, name), randomBytes(size));
    return {
      dir,
      budget: Object.fromEntries(names.map((n) => [n, limit])),
      sum: { files: names, limit: limit * 3 },
    };
  }

  const copiesOf = ({ dir, budget }) =>
    Object.keys(budget).map((name) => readFileSync(join(dir, name)));

  it('holds the committed art inside its rows', () => {
    for (const [name, limit] of Object.entries(ART_BUDGET)) {
      expect(readFileSync(join(ART_DIR, name)).length).toBeLessThanOrEqual(
        limit,
      );
    }
  });

  it('holds the three wide AVIF files inside their sum row', () => {
    const total = ART_SUM.files.reduce(
      (all, name) => all + readFileSync(join(ART_DIR, name)).length,
      0,
    );
    expect(total).toBeLessThanOrEqual(ART_SUM.limit);
  });

  it('passes shipped files inside their rows', () => {
    const art = sources(1000, 1200);
    const { findings, rows } = checkArt(exportWith(copiesOf(art)), art);
    expect(findings).toEqual([]);
    expect(rows.map((row) => row.bytes)).toEqual([1000, 1000, 2000]);
  });

  it('fails a file the export does not ship', () => {
    const art = sources(1000, 1200);
    const out = exportWith(copiesOf(art).slice(0, 1));
    const { findings } = checkArt(out, art);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/^two\.webp: no identical copy/);
  });

  it('fails a file over its row', () => {
    const art = sources(1000, 900);
    const { findings } = checkArt(exportWith(copiesOf(art)), art);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatch(/one\.avif: 1\.0 kB, over the 0\.9 kB budget/);
  });

  it('fails three files over their sum', () => {
    const art = sources(1000, 1200);
    const { findings } = checkArt(exportWith(copiesOf(art)), {
      ...art,
      sum: { files: Object.keys(art.budget), limit: 1500 },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/load 2\.0 kB of AVIF together/);
  });
});

describe('classify', () => {
  it('sorts a chunk by the marker it carries', () => {
    expect(classify(`x="${ISLAND_MARK}"`)).toBe('island');
    expect(classify(`x="${BACKGROUND_MARK}"`)).toBe('background');
    expect(classify(`x="${BAY_MARK}"`)).toBe('bay');
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
});

describe('checkMarkedChunks', () => {
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
    const { findings, rows } = checkMarkedChunks(lazySite(base()));
    expect(findings).toEqual([]);
    expect(rows.map((row) => row.row)).toEqual(['bay', 'runtime', 'light']);
  });

  it('fails a row over its budget and names its chunks', () => {
    const { findings } = checkMarkedChunks(
      lazySite(
        base({
          chunks: {
            'bay.js': mark(BAY_MARK, 21_000),
            'runtime.js': mark(RUNTIME_MARK, 33_000),
          },
        }),
      ),
    );
    expect(findings).toHaveLength(2);
    expect(findings[0]).toContain('bay controller');
    expect(findings[1]).toContain('core runtime');
  });

  it('counts an unmarked chunk in the group of the marked one, once in each group that lists it', () => {
    const { findings, rows } = checkMarkedChunks(
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
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('core runtime');
  });

  it('leaves out an unmarked chunk that no group lists with the marked one', () => {
    const { findings, rows } = checkMarkedChunks(
      lazySite(base({ chunks: { 'stray.js': noise(60_000) } })),
    );
    expect(findings).toEqual([]);
    expect(rows[0].chunks.map((chunk) => chunk.file)).toEqual([
      '_next/static/chunks/bay.js',
    ]);
  });

  it('counts the mask PNGs that the light group emits', () => {
    const { findings, rows } = checkMarkedChunks(
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
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('bay light');
  });

  it('fails a row with no marked chunk, so a minifier that drops a marker is seen', () => {
    const { findings } = checkMarkedChunks(
      lazySite({
        chunks: { 'bay.js': mark(BAY_MARK, 1_000), 'other.js': noise(1_000) },
        groups: [['bay.js'], ['other.js']],
      }),
    );
    expect(findings).toHaveLength(2);
    expect(findings.join(' ')).toContain(RUNTIME_MARK);
    expect(findings.join(' ')).toContain(LIGHT_MARK);
  });
});

describe('the bay and runtime rows', () => {
  it('states the rows of site UX spec 12.1 in bytes', () => {
    expect(BUDGETS.bay).toBe(20_000);
    expect(BUDGETS.runtime).toBe(32_000);
  });
});

describe('checkMarkedChunks on a built export', () => {
  const built = join(import.meta.dirname, '..', 'out');

  it.skipIf(!existsSync(join(built, '_next', 'static')))(
    'finds the bay controller and the run chunk of the docs build inside their rows',
    () => {
      const { findings, rows } = checkMarkedChunks(built);
      expect(findings).toEqual([]);
      expect(rows.every((row) => row.chunks.length >= 1)).toBe(true);
    },
  );
});
