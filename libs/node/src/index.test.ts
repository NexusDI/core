import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, provide, REQUEST } from '@nexusdi/core';

import { nodeScopes } from './index.js';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: string;
  }
}

const MISSION = new Token<string>('Mission');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
  exports: [MISSION],
});

describe('nodeScopes', () => {
  it('binds a scope to the async context of a run', async () => {
    const scopes = nodeScopes();
    const ship = await Nexus.create(Tactical);
    await using shuttle = await ship.createScope({
      request: { mission: 'survey-7' },
    });
    const seen = await scopes.run(shuttle, async () => {
      await Promise.resolve();
      return scopes.current()?.get(MISSION);
    });
    expect(seen).toBe('survey-7');
    expect(scopes.current()).toBeUndefined();
  });

  it('keeps two runs apart', async () => {
    const scopes = nodeScopes();
    const ship = await Nexus.create(Tactical);
    const a = await ship.createScope({ request: { mission: 'a' } });
    const b = await ship.createScope({ request: { mission: 'b' } });
    const [left, right] = await Promise.all([
      scopes.run(a, async () => scopes.current()?.get(MISSION)),
      scopes.run(b, async () => scopes.current()?.get(MISSION)),
    ]);
    expect([left, right]).toEqual(['a', 'b']);
    await ship[Symbol.asyncDispose]();
  });
});
