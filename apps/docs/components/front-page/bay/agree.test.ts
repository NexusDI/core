import type { TraceEvent } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { readFixtures, type FixtureError } from './fixtures';
import type { DescribedError } from './outcome';
import { check, describeError, launch } from './run';
import { checkLines, launchHeader, launchLines } from './terminal';

/** The fields of an error that the bay reads, by the class that carries them. */
function fieldsOf(error: DescribedError): Record<string, unknown> {
  switch (error.kind) {
    case 'missing-provider':
      return {
        token: error.token,
        requester: error.requester,
        module: error.module,
        nearMisses: error.nearMisses,
      };
    case 'invalid-export':
      return { token: error.token, module: error.module };
    case 'not-visible':
      return { token: error.token, owners: error.owners };
    case 'provider-failed':
      return { token: error.token, module: error.module };
    default:
      return {};
  }
}

/** What a fixture error holds, in the shape of a described error. */
function plain(error: DescribedError): FixtureError {
  return {
    code: error.code ?? '',
    fields: fieldsOf(error),
    message: error.message,
    ...(error.kind === 'blueprint'
      ? { entries: error.entries.map(plain) }
      : {}),
    ...(error.cause ? { cause: error.cause } : {}),
  };
}

/** The fixture error cut to the fields that the bay reads, so the two compare. */
function cut(expected: FixtureError, mine: FixtureError): FixtureError {
  const fields = Object.fromEntries(
    Object.keys(mine.fields).map((key) => [key, expected.fields[key]]),
  );
  return {
    ...expected,
    fields,
    ...(expected.entries
      ? {
          entries: expected.entries.map((entry, at) =>
            cut(entry, mine.entries?.[at] ?? entry),
          ),
        }
      : {}),
  };
}

const keep = (event: TraceEvent) => ({
  type: event.type,
  token: 'token' in event ? event.token : undefined,
  level: 'level' in event ? event.level : undefined,
  module: 'module' in event ? event.module : undefined,
  lifetime: 'lifetime' in event ? event.lifetime : undefined,
});

const fixtures = readFixtures();

describe('a browser run and the build-time fixtures agree', () => {
  it('reads one fixture per drill', () => {
    expect(fixtures.map((each) => each.id)).toEqual([
      'chart-server-down',
      'cut-both',
      'cut-comms',
      'cut-engineering',
      'hatch-computer',
      'hatch-drone',
      'offline-computer',
      'seed',
    ]);
  });

  it.each(fixtures.map((each) => [each.id, each] as const))(
    '%s: the check gives the same codes, fields and text with errors() and without',
    (_id, fixture) => {
      for (const [withErrors, expected] of [
        [true, fixture.check.withErrors],
        [false, fixture.check.plain],
      ] as const) {
        const result = check(fixture.state, withErrors);
        expect(result.ok).toBe(expected.ok);
        const mine = result.error ? plain(result.error) : null;
        expect(mine).toEqual(
          mine && expected.error ? cut(expected.error, mine) : expected.error,
        );
      }
    },
  );

  it.each(fixtures.map((each) => [each.id, each] as const))(
    '%s: the terminal prints the fixture text',
    (_id, fixture) => {
      const result = check(fixture.state, true);
      const text = checkLines(result)
        .filter((line) => line.source !== 'docs')
        .map((line) => line.text)
        .join('\n');
      expect(text).toBe(fixture.terminal.check);
    },
  );

  it.each(
    fixtures
      .filter((each) => each.launch)
      .map((each) => [each.id, each] as const),
  )(
    "%s: a launch emits the fixture's events and outcome",
    async (_id, fixture) => {
      const events: TraceEvent[] = [];
      const { outcome, ship } = await launch(fixture.state, (event) =>
        events.push(event),
      );
      const expected = fixture.launch;
      if (!expected) throw new Error('no launch');
      expect(outcome.ok).toBe(expected.ok);
      const mineError = outcome.error ? plain(outcome.error) : null;
      expect(mineError).toEqual(
        mineError && expected.error
          ? cut(expected.error, mineError)
          : expected.error,
      );
      expect(outcome.readout).toBe(expected.readout);
      const mineLookup = outcome.lookup
        ? { has: outcome.lookup.has, error: plain(outcome.lookup.error) }
        : null;
      expect(mineLookup).toEqual(
        mineLookup && expected.lookup
          ? {
              has: expected.lookup.has,
              error: cut(expected.lookup.error, mineLookup.error),
            }
          : expected.lookup,
      );
      // The fixture's trace holds the events up to the ship's dispose, which
      // the script runs after the readout and records apart.
      expect(
        events.map((event) => event.type).slice(0, expected.trace.length),
      ).toEqual(expected.trace.map((event) => event.type));
      expect(events.slice(0, expected.trace.length).map(keep)).toEqual(
        expected.trace.map(keep),
      );
      const printed = launchLines(outcome)
        .filter((line) => line.source !== 'docs' && line.source !== 'cause')
        .map((line) => (line.value ? 'Ready.' : line.text));
      expect(
        [...launchHeader().map((line) => line.text), ...printed].join('\n'),
      ).toBe(fixture.terminal.launch);
      await ship?.dispose();
    },
  );

  it('reads an error that is no NexusError as a plain line (P2)', () => {
    expect(describeError(new Error('boom'))).toEqual({
      kind: 'other',
      code: null,
      message: 'boom',
    });
  });
});
