import type { ShipReading } from '@nexusdi/meridian-systems';

import { expect, problems, test } from '../support';
import { advance, bridgeApi, gauge } from './ship';

test('fires the railgun from /systems/weapons', async ({ page, request }) => {
  const seen = problems(page);
  // The growth cases share one manual ship, which keeps its tick and its state
  // across the cases. The ftl case leaves the throttle at 1 and the burn at 0,
  // and its jump disarms the drive. The fire queues for t + 1 and arms the
  // mount on that tick. The capacitor takes 150 MJ a tick, so the shot leaves
  // at t + 2 with the bank at 300 MJ.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  const answer = page
    .getByRole('status')
    .filter({ hasText: 'Queued for tick' })
    .locator('p');
  const weapons = page.getByLabel('Railgun gauges');

  await page.goto('/systems/weapons');
  await expect(gauge(weapons, 'Status')).toHaveText('idle');
  await expect(gauge(weapons, 'Armed')).toHaveText('No');
  await expect(gauge(weapons, 'Capacitor charge')).toHaveText('0.0 MJ');
  await page.getByRole('button', { name: 'Fire', exact: true }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 1}`);

  await advance(request, 1);
  await page.reload();
  await expect(gauge(weapons, 'Status')).toHaveText('charging');
  await expect(gauge(weapons, 'Capacitor charge')).toHaveText('150.0 MJ');
  await expect(gauge(weapons, 'Capacitor power')).toHaveText('300.0 MW');
  await expect(gauge(weapons, 'Shot waiting')).toHaveText('10,000 m');

  await advance(request, 1);
  await page.reload();
  await expect(gauge(weapons, 'Shots fired')).toHaveText('1');
  await expect(gauge(weapons, 'Hits')).toHaveText('1');
  await expect(gauge(weapons, 'Last shot')).toHaveText(
    `hit at 10,000 m, tick ${tick + 2}`,
  );

  await advance(request, 4);
  await page.reload();
  await expect(gauge(weapons, 'Status')).toHaveText('charged');
  await expect(gauge(weapons, 'Capacitor charge')).toHaveText('400.0 MJ');
  await expect(gauge(weapons, 'Capacitor power')).toHaveText('0.0 MW');

  // The shot heats the coolant by 0.09 K and Safety raises no alarm.
  await page.goto('/systems/safety');
  await expect(page.getByText('No alarms')).toBeVisible();
  expect(seen).toEqual([]);
});
