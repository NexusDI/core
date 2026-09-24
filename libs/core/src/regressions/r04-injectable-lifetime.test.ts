import { describe, expect, it } from 'vitest';

import { Injectable, Module, Nexus } from '../index.js';

describe('R04', () => {
  it('honours the lifetime set in @Injectable and reports it in graph()', async () => {
    @Injectable({ deps: [], lifetime: 'transient' })
    class SurveyDrone {}
    @Injectable({ deps: [] })
    class ReactorCore {}
    @Module({ providers: [SurveyDrone, ReactorCore] })
    class Bay {}

    const ship = await Nexus.create(Bay);

    expect(ship.get(SurveyDrone)).not.toBe(ship.get(SurveyDrone));
    expect(ship.get(ReactorCore)).toBe(ship.get(ReactorCore));
    expect(ship.graph().providers.slice(0, 2)).toMatchObject([
      { token: 'SurveyDrone', lifetime: 'transient' },
      { token: 'ReactorCore', lifetime: 'singleton' },
    ]);
  });
});
