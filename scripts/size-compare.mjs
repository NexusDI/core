#!/usr/bin/env node
/**
 * Compares two size-report.mjs outputs for a pull request (spec §12.4).
 * Core growth above the threshold fails unless the description has a
 * `## Size` section; package growth is reported only.
 *
 *   PR_BODY="$body" node scripts/size-compare.mjs base.json head.json
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARKER = '<!-- nexusdi-size-report -->';

const pct = (base, head) =>
  `${head >= base ? '+' : ''}${(((head - base) / base) * 100).toFixed(2)}%`;
const bytes = (base, head) => `${head >= base ? '+' : ''}${head - base}`;

export function compareSizes(base, head, body, threshold) {
  // The merge base's fixture can fail to build against it: the first 0.4
  // pull request's base is core 0.3.1, whose API predates provide() and
  // Token (R22). There is nothing to compare core against, so the job
  // reports that and never fails on it. A base that does measure keeps the
  // ordinary growth rule; only a missing base figure skips it.
  const baseHasCore = typeof base.core === 'number';
  const growth = baseHasCore
    ? ((head.core - base.core) / base.core) * 100
    : null;
  const justified = /^## Size\b/m.test(body ?? '');
  const fail = baseHasCore && growth > threshold && !justified;
  const rows = [
    baseHasCore
      ? `| core | ${base.core} | ${head.core} | ${bytes(base.core, head.core)} | ${pct(base.core, head.core)} |`
      : `| core | no figure | ${head.core} | | |`,
    ...Object.keys(head.packages)
      .sort()
      .map((name) => {
        const was = base.packages[name];
        const now = head.packages[name];
        if (was === undefined) return `| @nexusdi/${name} | new | ${now} | | |`;
        if (was === null || now === null)
          return `| @nexusdi/${name} | no figure | ${now} | | |`;
        return `| @nexusdi/${name} | ${was} | ${now} | ${bytes(was, now)} | ${pct(was, now)} |`;
      }),
  ];
  const verdict = !baseHasCore
    ? 'The merge base has no figure for core: its API predates this fixture. Nothing to compare, so the check passes.'
    : growth <= threshold
      ? `Core grew ${growth.toFixed(2)}%, within the ${threshold}% threshold.`
      : justified
        ? `Core grew ${growth.toFixed(2)}%, over the ${threshold}% threshold; the description's Size section explains it.`
        : `Core grew ${growth.toFixed(2)}%, over the ${threshold}% threshold. Add a \`## Size\` section to the pull request description that says what the added bytes give the user and why they cannot live in a plugin.`;
  const markdown = [
    MARKER,
    '### Size report',
    '',
    'ESM consumer, esbuild --minify, gzip level 9, in bytes. A package figure is its fixture minus core.',
    '',
    '| Package | main | this PR | bytes | % |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    verdict,
  ].join('\n');
  return { markdown, fail };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [baseFile, headFile] = process.argv.slice(2);
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const { coreGrowthPercent } = read(
    join(import.meta.dirname, '..', 'size-report.json'),
  );
  const result = compareSizes(
    read(baseFile),
    read(headFile),
    process.env.PR_BODY ?? '',
    coreGrowthPercent,
  );
  console.log(result.markdown);
  process.exit(result.fail ? 1 : 0);
}
