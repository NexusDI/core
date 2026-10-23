import type { ShipReading } from '@nexusdi/meridian-systems';

import { expect, problems, test } from '../support';
import { advance, bridgeApi, gauge } from './ship';

test('spools and jumps from /systems/ftl', async ({ page, request }) => {
  const seen = problems(page);
  // The growth cases share one manual ship, which keeps its tick and its state
  // across the cases: the helm case leaves the throttle at 0.6 and the drive
  // burning at level 1. The level climbs from 0.6 to 0.9 in 30 ticks, so the
  // spool draws from tick + 41 on any start tick, and a spool queued for tick
  // q holds its full charge at tick q + 199.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  const answer = page
    .getByRole('status')
    .filter({ hasText: 'Queued for tick' })
    .locator('p');
  const ftl = page.getByLabel('FTL gauges');

  await page.goto('/systems/engineering');
  await page.getByLabel('Throttle').fill('1');
  await page.getByRole('button', { name: 'Set throttle' }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 1}`);
  await page.goto('/systems/helm');
  await page.getByLabel('Burn level').fill('0');
  await page.getByRole('button', { name: 'Burn', exact: true }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 1}`);
  await advance(request, 40);

  // No earlier case loads the drive, so the page reads the ship before it.
  await page.goto('/systems/ftl');
  await expect(gauge(ftl, 'Status')).toHaveText('offline');
  await expect(gauge(ftl, 'Spool charge')).toHaveText('0.0 GJ');
  await expect(gauge(ftl, 'Sector')).toHaveText('Sol');
  await page.getByRole('button', { name: 'Spool drive' }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 41}`);

  await advance(request, 200);
  await page.reload();
  await expect(gauge(ftl, 'Status')).toHaveText('charged');
  await expect(gauge(ftl, 'Spool charge')).toHaveText('90.0 GJ');

  await page.getByLabel('Star').selectOption('Proxima-b');
  await page.getByRole('button', { name: 'Jump', exact: true }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 241}`);
  await advance(request, 1);
  await page.reload();
  await expect(gauge(ftl, 'Status')).toHaveText('idle');
  await expect(gauge(ftl, 'Spool charge')).toHaveText('0.0 GJ');
  await expect(gauge(ftl, 'Sector')).toHaveText('Proxima-b');
  await expect(gauge(ftl, 'Last jump')).toHaveText(`tick ${tick + 241}`);

  // The jump heats the coolant by 10.8 K and Safety raises no alarm.
  await page.goto('/systems/safety');
  await expect(page.getByText('No alarms')).toBeVisible();
  expect(seen).toEqual([]);
});
