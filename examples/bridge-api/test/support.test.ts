import { describe, expect, it } from 'vitest';

import { servers } from '../e2e/servers';
import { calls } from './route-helpers';
import { FRAMEWORKS } from './support';

describe('FRAMEWORKS', () => {
  it('lists the three frameworks the bridge serves', () => {
    expect(FRAMEWORKS).toEqual(['hono', 'express', 'fastify']);
  });

  it('names every framework the route helpers and the e2e servers start', () => {
    expect(Object.keys(calls)).toEqual([...FRAMEWORKS]);
    expect(Object.keys(servers)).toEqual([...FRAMEWORKS]);
  });
});
