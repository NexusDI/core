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

/** Whether the description's `## Size` section names a fixture. */
function sizeSectionNames(body, name, label) {
  const section = /^## Size\b[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(
    body ?? '',
  )?.[1];
  return (
    section !== undefined && (section.includes(label) || section.includes(name))
  );
}

export function compareSizes(base, head, body, threshold) {
  // The merge base's fixture can fail to build against it: the first 0.4
  // pull request's base is core 0.3.1, whose API predates provide() and
  // Token (R22). There is nothing to compare core against, so the job
  // reports that and never fails on it. A base that does measure keeps the
  // ordinary growth rule; only a missing base figure skips it.
  //
  // The pull request's own head has no such excuse. A null head.core means
  // core (or the fixture) failed to bundle in this pull request, and that
  // fails the check unconditionally. It is not growth a `## Size` section
  // could justify. Treating a missing figure as 0 read a broken build as
  // core shrinking to nothing (fix round 1, reviewer finding).
  const baseHasCore = typeof base.core === 'number';
  const headHasCore = typeof head.core === 'number';
  const growth =
    baseHasCore && headHasCore
      ? ((head.core - base.core) / base.core) * 100
      : null;
  const justified = /^## Size\b/m.test(body ?? '');
  const fail =
    !headHasCore ||
    (baseHasCore && growth > threshold && !justified) ||
    (head.overBudget ?? []).some(
      ({ name, label }) => !sizeSectionNames(body, name, label),
    );
  const coreRow = !headHasCore
    ? `| core | ${baseHasCore ? base.core : 'no figure'} | no figure | | |`
    : baseHasCore
      ? `| core | ${base.core} | ${head.core} | ${bytes(base.core, head.core)} | ${pct(base.core, head.core)} |`
      : `| core | no figure | ${head.core} | | |`;
  const rows = [
    coreRow,
    ...Object.keys(head.packages)
      .sort()
      .map((name) => {
        const was = base.packages[name];
        const now = head.packages[name];
        if (was === undefined) return `| @nexusdi/${name} | new | ${now} | | |`;
        if (was === null || now === null)
          return `| @nexusdi/${name} | no figure | ${now ?? 'no figure'} | | |`;
        return `| @nexusdi/${name} | ${was} | ${now} | ${bytes(was, now)} | ${pct(was, now)} |`;
      }),
    // A standalone bundle, such as hono-worker, is a whole deployable,
    // framework included (spec 9.6).
    ...Object.keys(head.standalone ?? {})
      .sort()
      .map((name) => {
        const was = base.standalone?.[name];
        const now = head.standalone[name];
        if (was === undefined)
          return `| ${name} (whole bundle) | new | ${now ?? 'no figure'} | | |`;
        if (was === null || now === null)
          return `| ${name} (whole bundle) | no figure | ${now ?? 'no figure'} | | |`;
        return `| ${name} (whole bundle) | ${was} | ${now} | ${bytes(was, now)} | ${pct(was, now)} |`;
      }),
  ];
  // An adapter fixture over its budget fails like core over its threshold,
  // unless the description's `## Size` section names that fixture and says
  // what the added bytes give the user (spec 13.6).
  const overBudget = head.overBudget ?? [];
  const unjustified = overBudget.filter(
    ({ name, label }) => !sizeSectionNames(body, name, label),
  );
  const budgets =
    overBudget.length === 0
      ? []
      : [
          '',
          'Over budget:',
          ...overBudget.map(
            ({ label, size, budget, reason }) =>
              `- ${label} is ${size} bytes, over its ${budget}-byte budget (${reason})`,
          ),
          ...(unjustified.length === 0
            ? []
            : [
                '',
                `Name ${unjustified.map(({ label }) => label).join(', ')} in a \`## Size\` section of the pull request description, and say what the added bytes give the user.`,
              ]),
        ];
  const verdict = !headHasCore
    ? 'This pull request has no figure for core: it did not bundle against the fixture. Fix the build; a `## Size` section cannot justify a broken build.'
    : !baseHasCore
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
    ...budgets,
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
