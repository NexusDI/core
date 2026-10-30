import { nodeScopes } from '@nexusdi/node';
import { expect, it } from 'vitest';

import { servers } from '../../e2e/servers';
import { scopedShip } from '../route-helpers';
import { FRAMEWORKS } from '../support';

/** GET `path` as the mission `id`, which the bridge reads from `x-mission-id`. */
const asMission = (url: string, path: string, id: string) =>
  fetch(`${url}${path}`, { headers: { 'x-mission-id': id } });

it('two concurrent requests with different mission ids record into separate flight logs on each framework', async () => {
  for (const framework of FRAMEWORKS) {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const bridge = await servers[framework](ship, scopes);
    try {
      const [alpha, beta] = await Promise.all(
        ['survey-1', 'survey-2'].map(async (id) => {
          const res = await asMission(bridge.url, '/course/Proxima-b', id);
          return (await res.json()) as { entries: string[] };
        }),
      );
      expect(alpha?.entries, framework).toEqual([
        'survey-1: plotting Proxima-b',
      ]);
      expect(beta?.entries, framework).toEqual([
        'survey-2: plotting Proxima-b',
      ]);
    } finally {
      await bridge.close();
    }
  }
});
