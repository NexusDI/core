import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { ShipReading } from '@nexusdi/meridian-systems';

import { GROWTH } from '../ports.ts';

/** The manual bridge-api the growth config starts. */
const bridgeApi = `http://127.0.0.1:${GROWTH.api}`;

/** The ship as `GET /sim` reads it. */
export async function sim(request: APIRequestContext): Promise<ShipReading> {
  const answer = await request.get(`${bridgeApi}/sim`);
  expect(answer.status()).toBe(200);
  return (await answer.json()) as ShipReading;
}

/**
 * Clicks the order button `name` and waits for bridge-api to queue the
 * order its `POST /commands` sends.
 */
export async function order(page: Page, name: string): Promise<void> {
  const answer = page.waitForResponse(
    (response) =>
      response.url() === `${bridgeApi}/commands` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name }).click();
  expect((await answer).status()).toBe(202);
}

/** Advances the manual ship by one tick. */
export async function advance(request: APIRequestContext): Promise<void> {
  const answer = await request.post(`${bridgeApi}/sim/advance`, {
    data: { ticks: 1 },
  });
  expect(answer.status()).toBe(200);
}
