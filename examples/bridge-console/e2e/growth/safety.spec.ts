import type { ShipReading } from '@nexusdi/meridian-systems';
import type { APIRequestContext, Locator } from '@playwright/test';

import { GROWTH_PORTS } from '../../playwright.servers.mts';
import { expect, problems, test } from '../support';

/** The bridge API the growth config starts. */
const bridgeApi = `http://127.0.0.1:${GROWTH_PORTS.api}`;

/** The value of the gauge named `name` in the gauge list `gauges`. */
const gauge = (gauges: Locator, name: string) =>
  gauges.locator(`dt:text-is("${name}") + dd`);

/** Advances the manual ship by `ticks` and returns the tick it holds after. */
async function advance(
  request: APIRequestContext,
  ticks: number,
): Promise<number> {
  const answer = await request.post(`${bridgeApi}/sim/advance`, {
    data: { ticks },
  });
  expect(answer.status()).toBe(200);
  return ((await answer.json()) as { tick: number }).tick;
}

test('works the doors and puts out a reactor bay fire on /systems/safety', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The growth cases share one manual ship, which keeps its tick and its air
  // across the cases, so each command queues for the tick after the one the
  // ship holds when the command goes out.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  const answer = page
    .getByRole('status')
    .filter({ hasText: 'Queued for tick' });
  const door = page.getByLabel('Door', { exact: true });
  const room = page.getByLabel('Room', { exact: true });
  const alarms = page.getByRole('list', { name: 'Alarms' });

  await page.goto('/systems/safety');
  await door.selectOption('bridge-habitat');
  await page.getByRole('button', { name: 'Open door' }).click();
  await expect(answer.locator('p')).toHaveText(`Queued for tick ${tick + 1}`);
  await expect(answer.getByRole('listitem')).toHaveText([
    'survey-7: opened bridge-habitat',
  ]);

  // The airlock holds the habitat's air, and space holds none, so the
  // interlock refuses the outer door. The difference follows the airlock's
  // pressure, which life support's run moves.
  await door.selectOption('airlock-outer');
  await page.getByRole('button', { name: 'Open door' }).click();
  await expect(page.getByRole('alert').locator('p')).toHaveText([
    /^The airlock-outer door holds [\d,]+ Pa of difference, above the 5,000 Pa interlock\.$/,
    'Fix: bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
  ]);

  // The open and the close both queue for the next tick, which applies them
  // in order, so the door ends the tick shut.
  await door.selectOption('bridge-habitat');
  await page.getByRole('button', { name: 'Close door' }).click();
  await expect(answer.getByRole('listitem')).toHaveText([
    'survey-7: closed bridge-habitat',
  ]);
  const shut = await advance(request, 1);
  await page.reload();
  await expect(
    gauge(page.getByLabel('bridge-habitat door', { exact: true }), 'Door'),
  ).toHaveText('Shut');

  // A drill lights a fire of 0.05 on the next tick, and a flood from the
  // tick after puts it out within 70 ticks.
  await room.selectOption('reactor-bay');
  await page.getByRole('button', { name: 'Drill' }).click();
  await expect(answer.locator('p')).toHaveText(`Queued for tick ${shut + 1}`);
  await expect(answer.getByRole('listitem')).toHaveCount(0);
  const lit = await advance(request, 1);
  await page.reload();
  await expect(alarms.getByRole('listitem')).toHaveText([
    'FIRE in reactor-bay',
  ]);

  await room.selectOption('reactor-bay');
  await page.getByRole('button', { name: 'Flood' }).click();
  await expect(answer.locator('p')).toHaveText(`Queued for tick ${lit + 1}`);
  await advance(request, 70);
  await page.reload();
  await expect(page.getByText('No alarms')).toBeVisible();
  await expect(alarms).toHaveCount(0);
  expect(seen).toEqual([]);
});
