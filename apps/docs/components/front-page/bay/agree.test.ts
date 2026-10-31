import type { TraceEvent } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { readFixtures, type FixtureError } from './fixtures';
import type { DescribedError } from './outcome';
import { check, describeError, launch } from './run';
import { checkLines, launchHeader, launchLines } from './terminal';

/** What a fixture error holds, without the bay's own `kind`. */
function plain(error: DescribedError): FixtureError {
  return {
    code: error.code ?? '',
    fields: error.fields as Record<string, unknown>,
    message: error.message,
    ...(error.entries ? { entries: error.entries.map(plain) } : {}),
    ...(error.cause ? { cause: error.cause } : {}),
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
        expect(result.error ? plain(result.error) : null).toEqual(
          expected.error,
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
      expect(outcome.error ? plain(outcome.error) : null).toEqual(
        expected.error,
      );
      expect(outcome.readout).toBe(expected.readout);
      expect(
        outcome.lookup
          ? { has: outcome.lookup.has, error: plain(outcome.lookup.error) }
          : null,
      ).toEqual(expected.lookup);
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
      fields: {},
      message: 'boom',
    });
  });
});
