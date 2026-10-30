import { expect, test } from '@playwright/test';

import { problems } from '../support.ts';
import { advance, order, queue, sim } from './ship.ts';

test('sends the helm and reactor orders over the command link from /command', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The orders queue setpoints with no power check, so they hold on the cold
  // reactor of the manual ship.
  const { tick } = await sim(request);
  await page.goto('/command');
  await expect(
    page.getByText('course to Kepler-442b, heading 42'),
  ).toBeVisible();
  const receipt = page.getByRole('status');

  await order(page, 'Steer for Kepler-442b');
  await expect(receipt).toHaveText(`Queued for tick ${tick + 1}`);
  await order(page, 'Burn at 0.5');
  await expect(receipt).toHaveText(`Queued for tick ${tick + 1}`);

  await order(page, 'Reactor to full throttle');
  await expect(receipt).toHaveText(`Queued for tick ${tick + 1}`);

  // Kepler-442b is charted at 42 degrees, 0.733 rad.
  await advance(request);
  const { setpoints } = await sim(request);
  expect(setpoints.helm.heading).toBeCloseTo(0.733, 3);
  expect(setpoints.drive.throttle).toBe(0.5);
  expect(setpoints.reactor.throttle).toBe(1);
  // The reactor has climbed one tick, so the router sheds the drive.
  await expect(page.getByLabel('Burn allocation')).toHaveText(
    'Burn served: shed',
  );
  // The growth ship is shared with the life-support case. Put the reactor
  // throttle back to its idle setpoint; the order applies on that case's
  // first advance, after its reads.
  await queue(request, {
    system: 'engineering',
    action: 'throttle',
    level: 0,
  });
  expect(await seen()).toEqual([]);
});
