import {
  entriesOf,
  type DescribedError,
  type CheckResult,
  type LaunchOutcome,
} from './outcome';

/**
 * The lines the terminal prints. Each is what core and `@nexusdi/errors`
 * returned, split at the line breaks core wrote, with the shell's own
 * `$ npm run preflight` and `exit N` around it. `scene-fixtures.mjs` writes
 * the same text for the build-time fixtures, and the tests hold the two
 * equal. No line is parsed: the code link comes from an entry's own `code`.
 */

export interface LogLine {
  readonly source: string;
  readonly text: string;
  /** A value printed in the data colour after the text, such as a time. */
  readonly value?: string;
  readonly status?: 'ok' | 'alarm' | 'pass' | 'fail';
  /** The code pages the line links to, one link each. */
  readonly codes?: readonly string[];
  /** A Fix: line core printed on its own. */
  readonly kind?: 'error' | 'plain';
}

const split = (
  text: string,
  source: string,
  kind: 'error' | 'plain' = 'plain',
): LogLine[] => text.split('\n').map((line) => ({ source, text: line, kind }));

/** The codes of the entries of an error, once each, in order. */
function codesOf(error: DescribedError): string[] {
  const seen: string[] = [];
  for (const entry of [error, ...entriesOf(error)]) {
    if (entry.code !== null && !seen.includes(entry.code))
      seen.push(entry.code);
  }
  return seen;
}

function codeLines(error: DescribedError): LogLine[] {
  return [{ source: 'docs', text: '', codes: codesOf(error) }];
}

/** What `npm run preflight` prints for a check. */
export function checkLines(result: CheckResult): LogLine[] {
  const lines: LogLine[] = [{ source: 'shell', text: '$ npm run preflight' }];
  if (result.ok) {
    lines.push({ source: 'node', text: 'pre-flight ok' });
    lines.push({ source: 'shell', text: 'exit 0', status: 'ok' });
  } else if (result.error) {
    lines.push(
      ...split(result.error.message, 'errors', 'error'),
      ...codeLines(result.error),
      { source: 'shell', text: 'exit 1', status: 'alarm' },
    );
  }
  return lines;
}

/** The first two lines of a launch. */
export function launchHeader(): LogLine[] {
  return [
    { source: 'shell', text: '$ npm start' },
    { source: 'node', text: 'ship = await Nexus.create(Meridian)' },
  ];
}

/** What `npm start` prints once `Nexus.create` settled and the bridge read the ship. */
export function launchLines(outcome: LaunchOutcome): LogLine[] {
  if (!outcome.ok && outcome.error) {
    const lines: LogLine[] = [];
    if (outcome.error.cause)
      lines.push({
        source: 'cause',
        text: outcome.error.cause.message,
        kind: 'error',
      });
    lines.push(
      ...split(outcome.error.message, 'errors', 'error'),
      ...codeLines(outcome.error),
      { source: 'shell', text: 'exit 1', status: 'alarm' },
    );
    return lines;
  }
  const lines: LogLine[] = [
    outcome.startupMs === null
      ? { source: 'node', text: 'Ready.' }
      : {
          source: 'node',
          text: 'Ready in',
          value: `${outcome.startupMs.toFixed(0)} ms`,
        },
  ];
  if (outcome.lookup) {
    lines.push(
      ...split(outcome.lookup.error.message, 'errors', 'error'),
      ...codeLines(outcome.lookup.error),
    );
  } else if (outcome.readout !== null) {
    lines.push({ source: 'bridge', text: outcome.readout });
  }
  return lines;
}

/** The caption under the terminal after a launch that the check could not foresee (4.6). */
export function captionOf(outcome: LaunchOutcome | null): string | null {
  if (outcome === null) return null;
  if (!outcome.ok && outcome.error?.kind === 'provider-failed')
    return 'Nexus.check passed: the wiring is right. The chart server failed at startup, and Nexus.create took down what it had built.';
  if (outcome.lookup?.error.kind === 'not-visible')
    return "The wiring passed. The bridge's lookup is your own code, which no check sees, and it asked for a system that its module keeps private.";
  return null;
}
