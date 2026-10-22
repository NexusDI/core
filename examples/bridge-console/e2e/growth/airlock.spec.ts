import type { ShipReading } from '@nexusdi/meridian-systems';
import type { Locator } from '@playwright/test';

import { expect, problems, test } from '../support';
import { advance, bridgeApi, gauge, reading } from './ship';

test('cycles the airlock under the interlock on /airlock', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The growth cases share one manual ship, which keeps its tick and its state
  // across the cases. Life support is online by now, and the
  // airlock holds the habitat's air with both doors shut. Each command queues
  // for the tick after the one the ship holds when the command goes out.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  const answer = page
    .getByRole('status')
    .filter({ hasText: 'Queued for tick' });
  const refusal = page.getByRole('alert').locator('p');
  const door = page.getByLabel('Door', { exact: true });
  const pump = page.getByLabel('Airlock pump mode');
  const outer = page.getByLabel('airlock-outer door', { exact: true });
  const inner = page.getByLabel('habitat-airlock door', { exact: true });
  // `press` returns once the console has answered its post, so the next click
  // cannot cancel it.
  const press = async (name: string) => {
    const posted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.startsWith('/airlock'),
    );
    await page.getByRole('button', { name }).click();
    await posted;
  };
  const airlockSide = (doorGauges: Locator) =>
    gauge(doorGauges, 'Airlock side');

  // A pump-down to the stall leaves the airlock near 9.0 kPa, 4 kPa above
  // the interlock, so the outer door stays shut.
  await page.goto('/airlock');
  await pump.selectOption('evacuate');
  await press('Set pump');
  await expect(answer.locator('p')).toHaveText(`Queued for tick ${tick + 1}`);
  await advance(request, 300);
  await page.reload();
  await expect(
    gauge(page.getByLabel('Airlock pump and vent'), 'Pump'),
  ).toHaveText('evacuate');
  await expect(airlockSide(outer)).toHaveText(/^\d\.\d kPa$/);
  expect(await reading(airlockSide(outer))).toBeGreaterThanOrEqual(8.5);
  expect(await reading(airlockSide(outer))).toBeLessThanOrEqual(9.5);
  await door.selectOption('airlock-outer');
  await press('Open door');
  await expect(refusal).toHaveText([
    /^The airlock-outer door holds [\d,]+ Pa of difference, above the 5,000 Pa interlock\.$/,
    'Fix: bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
  ]);

  // The vent takes the stalled airlock under the interlock within 40 ticks
  // (3.9 kPa in the model), and the outer door opens.
  await pump.selectOption('off');
  await press('Set pump');
  await press('Open vent');
  await advance(request, 40);
  await page.reload();
  expect(await reading(airlockSide(outer))).toBeGreaterThanOrEqual(3.5);
  expect(await reading(airlockSide(outer))).toBeLessThanOrEqual(4.5);
  await door.selectOption('airlock-outer');
  await press('Open door');
  await expect(answer.getByRole('listitem')).toHaveText([
    'survey-7: opened airlock-outer',
  ]);
  await advance(request, 20);
  await page.reload();
  await expect(gauge(outer, 'Door')).toHaveText('Open');
  await expect(airlockSide(outer)).toHaveText('0.0 kPa');

  // The fill queues for the tick of the close and the vent shut. The inner
  // door stays refused until the fill brings the airlock within 5 kPa of the
  // habitat, after 110 ticks. The case fills for 114 ticks, which leaves 554 Pa
  // between them.
  await door.selectOption('airlock-outer');
  await press('Close door');
  await press('Shut vent');
  await pump.selectOption('fill');
  await press('Set pump');
  await door.selectOption('habitat-airlock');
  await press('Open door');
  await expect(refusal.first()).toHaveText(
    /^The habitat-airlock door holds [\d,]+ Pa of difference, above the 5,000 Pa interlock\.$/,
  );
  await advance(request, 114);
  await pump.selectOption('off');
  await press('Set pump');
  await door.selectOption('habitat-airlock');
  await press('Open door');
  await expect(answer.getByRole('listitem')).toHaveText([
    'survey-7: opened habitat-airlock',
  ]);
  await advance(request, 20);
  await page.reload();
  await expect(gauge(inner, 'Door')).toHaveText('Open');
  const sides = [
    await reading(gauge(inner, 'Habitat side')),
    await reading(airlockSide(inner)),
  ];
  expect(Math.abs((sides[0] ?? 0) - (sides[1] ?? 0))).toBeLessThanOrEqual(0.5);

  // The drill raised no alarm anywhere.
  await page.goto('/systems/safety');
  await expect(page.getByText('No alarms')).toBeVisible();
  expect(seen).toEqual([]);
});
