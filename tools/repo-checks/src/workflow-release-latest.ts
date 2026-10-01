import { parse } from 'yaml';

/**
 * `workflow-release-latest` (docs spec section 14.3): every `gh release create`
 * in a workflow sets `--latest`. GitHub marks a release created without the
 * flag as the repository's latest when it is the newest one, which is how the
 * docs-snapshot-0.3 release once took the place of @nexusdi/core@0.3.2.
 *
 * A run script is read as bash joins it: a line ending in a backslash
 * continues on the next. Quoted text is dropped before the command is found,
 * so an `echo "would run gh release create"` is no call. The flag may sit on
 * the call itself or in the argument array the call expands.
 */

interface Step {
  name?: string;
  run?: unknown;
}

const CALL = /\bgh\s+release\s+create\b/;
const FLAG = /--latest(?:[=\s"']|$)/;
const ARRAY = /\$\{(\w+)\[@\]\}/;

const unquoted = (line: string): string =>
  line.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');

export function checkReleaseLatest(file: string, source: string): string[] {
  const workflow = parse(source) as {
    jobs?: Record<string, { steps?: Step[] }>;
  };
  const findings: string[] = [];

  for (const [job, { steps = [] }] of Object.entries(workflow.jobs ?? {})) {
    for (const step of steps) {
      if (typeof step.run !== 'string') continue;
      const script = step.run.replace(/\\\n\s*/g, ' ');
      for (const line of script.split('\n')) {
        if (!CALL.test(unquoted(line))) continue;
        if (FLAG.test(line)) continue;
        const array = ARRAY.exec(line)?.[1];
        const assigned =
          array !== undefined &&
          new RegExp(`\\b${array}\\+?=\\(([^)]*)\\)`).exec(script)?.[1];
        if (typeof assigned === 'string' && FLAG.test(assigned)) continue;
        findings.push(
          `${file}: jobs.${job} step "${step.name ?? '(unnamed)'}" runs gh release create without --latest. GitHub marks such a release the latest; pass --latest=false, or --latest=$LATEST from the release plan.`,
        );
      }
    }
  }

  return findings.sort();
}
