import type { ShipReading } from '@nexusdi/meridian-systems';

import { expect, problems, test } from '../support';
import { advance, bridgeApi, gauge } from './ship';

test('hails from /systems/comms on the offline ship', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The growth cases share one manual ship, which keeps its tick and its state
  // across the cases. The ship has no subspace link, so the hail stays queued
  // for good and this case runs last.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  const gauges = page.getByLabel('Comms gauges');

  await page.goto('/systems/comms');
  await expect(gauge(gauges, 'Status')).toHaveText('standby');
  await expect(gauge(gauges, 'Hail queued')).toHaveText('No');
  await page
    .getByRole('button', { name: 'Hail fleet traffic control' })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Queued for tick' })
      .locator('p'),
  ).toHaveText(`Queued for tick ${tick + 1}`);

  // The queued hail waits for a link the ship lacks, so the array stays silent.
  await advance(request, 10);
  await page.reload();
  await expect(gauge(gauges, 'Status')).toHaveText('no subspace link');
  await expect(gauge(gauges, 'Hail queued')).toHaveText('Yes');
  await expect(gauge(gauges, 'Last hail sent')).toHaveText('none');
  await expect(gauge(gauges, 'Array power')).toHaveText('0.0 MW');
  await expect(page.getByText('No messages')).toBeVisible();
  expect(seen).toEqual([]);
});
