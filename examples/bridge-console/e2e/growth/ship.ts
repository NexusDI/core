import type { APIRequestContext, Locator } from '@playwright/test';

import { GROWTH_PORTS } from '../../playwright.servers.mts';
import { expect } from '../support';

/** The bridge API the growth config starts. */
export const bridgeApi = `http://127.0.0.1:${GROWTH_PORTS.api}`;

/** The value of the gauge named `name` in the gauge list `gauges`. */
export const gauge = (gauges: Locator, name: string) =>
  gauges.locator(`dt:text-is("${name}") + dd`);

/** Advances the manual ship by `ticks` and returns the tick it holds after. */
export async function advance(
  request: APIRequestContext,
  ticks: number,
): Promise<number> {
  const answer = await request.post(`${bridgeApi}/sim/advance`, {
    data: { ticks },
  });
  expect(answer.status()).toBe(200);
  return ((await answer.json()) as { tick: number }).tick;
}

/** The number a gauge shows, read from its text such as `292.8 K`. */
export async function reading(value: Locator): Promise<number> {
  return Number((await value.innerText()).split(' ')[0]?.replaceAll(',', ''));
}
