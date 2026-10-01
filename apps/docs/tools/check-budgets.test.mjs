// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BACKGROUND_MARK,
  BUDGETS,
  ISLAND_MARK,
  checkBudgets,
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
    });
  });
});
