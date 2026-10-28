import { Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { WATCH_LOG } from '../app/di/contracts';
import { Watch } from '../app/di/watch.module';

describe('the watch log', () => {
  it("prefixes each entry with the request's mission", async () => {
    await using ship = await Nexus.create(Watch);
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-9', target: 'Kepler-442b' } },
    });
    scope.get(WATCH_LOG).record('docked');
    expect(scope.get(WATCH_LOG).entries()).toEqual(['survey-9: docked']);
  });
});
