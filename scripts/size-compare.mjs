#!/usr/bin/env node
/**
 * Compares two size-report.mjs outputs for a pull request (spec §12.4).
 * Core growth above the threshold fails unless the description has a
 * `## Size` section; package growth is reported only. A fixture over its
 * budget fails only when this pull request made it bigger than the base.
 * The reason for a failure goes to the optional third argument's file.
 *
 *   PR_BODY="$body" node scripts/size-compare.mjs base.json head.json [reason.txt]
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
  // A fixture over its budget fails only when this pull request grew it.
  // size-compare lists a fixture already over on the base and not grown
  // here, and passes it, so a pull request does not inherit an overage it
  // did not cause.
  const overBudget = head.overBudget ?? [];
  const baseSize = ({ name, label }) =>
    label === name ? base.standalone?.[name] : base.packages?.[name];
  const grewOver = (entry) => {
    const was = baseSize(entry);
    return typeof was !== 'number' || entry.size > was;
  };
  const unjustified = overBudget.filter(
    (entry) =>
      grewOver(entry) && !sizeSectionNames(body, entry.name, entry.label),
  );
  const coreOver = baseHasCore && growth > threshold && !justified;
  const reasons = [
    ...(!headHasCore
      ? [
          'core has no figure: it did not bundle against the fixture. Fix the build; a `## Size` section cannot justify a broken build.',
        ]
      : []),
    ...(coreOver
      ? [
          `core grew ${growth.toFixed(2)}%, over the ${threshold}% threshold. Add a \`## Size\` section to the pull request description that says what the added bytes give the user and why they cannot live in a plugin.`,
        ]
      : []),
    ...(unjustified.length === 0
      ? []
      : [
          `${unjustified.map(({ label }) => label).join(', ')} grew past ${unjustified.length === 1 ? 'its budget' : 'their budgets'}. Name ${unjustified.length === 1 ? 'it' : 'them'} in a \`## Size\` section of the pull request description, and say what the added bytes give the user.`,
        ]),
  ];
  const fail = reasons.length > 0;
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
  // An adapter fixture that grew over its budget fails like core over its
  // threshold, unless the description's `## Size` section names that fixture
  // and says what the added bytes give the user (spec 13.6).
  const budgets =
    overBudget.length === 0
      ? []
      : [
          '',
          'Over budget:',
          ...overBudget.map(
            (entry) =>
              `- ${entry.label} is ${entry.size} bytes, over its ${entry.budget}-byte budget (${entry.reason})${grewOver(entry) ? '' : '; the base was already over, so this does not fail the check'}`,
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
  return { markdown, fail, reason: reasons.join(' ') };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [baseFile, headFile, reasonFile] = process.argv.slice(2);
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
  if (reasonFile && result.fail)
    writeFileSync(reasonFile, `${result.reason}\n`);
  process.exit(result.fail ? 1 : 0);
}
