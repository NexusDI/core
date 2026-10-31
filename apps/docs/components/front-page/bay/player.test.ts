import type { TraceEvent } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { createPlayer, STEP_MS } from './player';

const build = (token: string, level: number, type = 'construct') =>
  ({ type, token, level }) as unknown as TraceEvent;
const other = (type: string) => ({ type }) as unknown as TraceEvent;

function harness(options: { instant?: boolean } = {}) {
  const batches: string[][] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const player = createPlayer(
    (batch) =>
      batches.push(
        batch.map((event) =>
          'token' in event ? String(event.token) : event.type,
        ),
      ),
    {
      ...options,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    },
  );
  return { player, batches, sleeps };
}

describe('the sequence-tier player', () => {
  it('lights the systems of one level together and each other event alone', async () => {
    const { player, batches } = harness();
    [
      other('compile'),
      build('ReactorCore', 0),
      build('SubspaceLink', 0),
      build('ShipComputer', 1, 'construct:await'),
      build('ShipComputer', 1),
      other('run'),
    ].forEach((event) => player.push(event));
    await player.drain();
    expect(batches).toEqual([
      ['compile'],
      ['ReactorCore', 'SubspaceLink'],
      ['ShipComputer', 'ShipComputer'],
      ['run'],
    ]);
  });

  it('waits 120 ms between steps', async () => {
    const { player, sleeps } = harness();
    player.push(other('compile'));
    player.push(build('ReactorCore', 0));
    await player.drain();
    expect(sleeps[0]).toBeLessThanOrEqual(STEP_MS);
    expect(sleeps.every((ms) => ms <= STEP_MS)).toBe(true);
  });

  it('plays at once when it is instant, or when finish() is called', async () => {
    const instant = harness({ instant: true });
    instant.player.push(build('ReactorCore', 0));
    expect(instant.batches).toHaveLength(1);
    expect(instant.sleeps).toEqual([]);

    const stopped = harness();
    stopped.player.push(other('compile'));
    stopped.player.push(other('run'));
    stopped.player.finish();
    await stopped.player.drain();
    expect(stopped.batches).toHaveLength(2);
  });
});
