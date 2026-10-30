import { InterlockError } from '@nexusdi/meridian-systems';
import { shipText } from '@nexusdi/meridian-systems/text';
import { nodeScopes } from '@nexusdi/node';
import { expect, it } from 'vitest';

import { calls, json, scopedShip } from '../route-helpers';

const open = (door: string) => json({ system: 'safety', action: 'open', door });

it('an allowed open logs one flight-log entry, and a refused open answers 409 MERIDIAN_INTERLOCK with its fix line and no flight-log entry', async () => {
  const scopes = nodeScopes();
  await using ship = await scopedShip(scopes);
  const post = (door: string) =>
    calls.hono(
      ship,
      'POST',
      '/commands',
      open(door),
      { scopes },
      {
        'x-mission-id': 'survey-3',
      },
    );

  // The bound order is not observable through public API yet, see
  // NexusDI/core issue #257. This case pins only the two outcomes.
  // An open the interlock lets through leaves one entry in the request's log.
  expect(await post('bridge-habitat')).toEqual({
    status: 202,
    body: { tick: 1, flightLog: ['survey-3: opened bridge-habitat'] },
  });

  // A refused open leaves no entry, and the answer carries the code and the fix line.
  const refused = await post('airlock-outer');
  expect(refused.status).toBe(409);
  const body = refused.body as {
    code: string;
    message: string;
    fix: string;
    flightLog?: unknown;
  };
  expect(body.code).toBe('MERIDIAN_INTERLOCK');
  expect(body).not.toHaveProperty('flightLog');
  const text = shipText.MERIDIAN_INTERLOCK(
    new InterlockError({ door: 'airlock-outer', difference: 0, limit: 5_000 }),
  );
  expect(text.fix).toBeTypeOf('string');
  expect(body.fix).toBe(text.fix);
});
