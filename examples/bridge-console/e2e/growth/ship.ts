import type { APIRequestContext, Locator, Page } from '@playwright/test';

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

/**
 * Waits until the page's status strip shows tick `tick`, which is the
 * telemetry frame that follows an advance. The page is not reloaded, so the
 * gauges that follow read what the frame carried.
 */
export async function frame(page: Page, tick: number) {
  await expect(
    page.getByRole('status', { name: 'Ship status' }).locator('dd').first(),
  ).toHaveText(String(tick));
}

/** The first line of the answer band for a command queued for `tick`, with the thousands grouped. */
export const queuedAt = (tick: number) =>
  `Queued for tick ${tick.toLocaleString('en-US')}.`;
