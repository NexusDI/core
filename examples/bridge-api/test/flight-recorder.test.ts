import { Nexus } from '@nexusdi/core';
import { COMMAND_DESK, InterlockError } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { describe, expect, it } from 'vitest';

import { FLIGHT_LOG } from '../src/ship/contracts';
import { OfflineMeridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';

const open = (door: string) => ({ system: 'safety', action: 'open', door });

describe('the flight recorder', () => {
  it('records an opened door in the current scope and nothing for a refused one', async () => {
    const scopes = nodeScopes();
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins({ scopes }),
    });
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    });
    const desk = ship.get(COMMAND_DESK);

    // The recorder writes after next() returns, so an open the interlock
    // refuses records nothing.
    expect(() =>
      scopes.run(scope, () => desk.submit(open('airlock-outer'))),
    ).toThrow(InterlockError);
    expect(scope.get(FLIGHT_LOG).entries()).toEqual([]);

    expect(
      scopes.run(scope, () => desk.submit(open('bridge-habitat'))),
    ).toEqual({ tick: 1 });
    expect(scope.get(FLIGHT_LOG).entries()).toEqual([
      'survey-7: opened bridge-habitat',
    ]);
  });

  it('records nothing for a command submitted outside a run', async () => {
    const scopes = nodeScopes();
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins({ scopes }),
    });
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    });
    expect(ship.get(COMMAND_DESK).submit(open('bridge-habitat'))).toEqual({
      tick: 1,
    });
    expect(scope.get(FLIGHT_LOG).entries()).toEqual([]);
  });

  it('answers the tick without scopes', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    expect(ship.get(COMMAND_DESK).submit(open('bridge-habitat'))).toEqual({
      tick: 1,
    });
  });
});
