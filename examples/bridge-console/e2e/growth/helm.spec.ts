import type { ShipReading } from '@nexusdi/meridian-systems';

import { expect, problems, test } from '../support';
import { advance, bridgeApi, gauge } from './ship';

test('flies a course to Kepler-442b from /systems/helm', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The growth cases share one manual ship, which keeps its tick and its state
  // across the cases: the throttle holds 0.01 and life support is online. A
  // turn needs the reactor above 0.0165, so the case raises the throttle
  // first. The burn starts after the ship settles on the course, so every
  // read below holds on any start tick.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  const answer = page
    .getByRole('status')
    .filter({ hasText: 'Queued for tick' })
    .locator('p');
  const helm = page.getByLabel('Helm gauges');
  const drive = page.getByLabel('Main drive gauges');

  await page.goto('/systems/engineering');
  await page.getByLabel('Throttle').fill('0.6');
  await page.getByRole('button', { name: 'Set throttle' }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 1}`);
  await advance(request, 10);

  await page.goto('/systems/helm');
  await expect(gauge(helm, 'Heading')).toHaveText('0.0°');
  await expect(gauge(helm, 'Course')).toHaveText('0.0°');
  await expect(gauge(drive, 'Thrust')).toHaveText('0 N');
  await page.getByLabel('Star').selectOption('Kepler-442b');
  await page.getByRole('button', { name: 'Plot course' }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 11}`);

  // The turn settles in under 800 ticks, and the thrusters draw 0 W once it does.
  await advance(request, 800);
  await page.reload();
  await expect(gauge(helm, 'Heading')).toHaveText('42.0°');
  await expect(gauge(helm, 'Course')).toHaveText('42.0°');
  await expect(gauge(helm, 'Turn rate')).toHaveText('0.00 °/s');
  await expect(gauge(helm, 'Thruster torque')).toHaveText('0 N·m');
  await expect(gauge(helm, 'Thruster power')).toHaveText('0.0 MW');

  // The burn on the course adds 0.0036 m/s² for 400 ticks of 0.5 s.
  await expect(page.getByLabel('Burn level')).toHaveValue('1');
  await page.getByRole('button', { name: 'Burn', exact: true }).click();
  await expect(answer).toHaveText(`Queued for tick ${tick + 811}`);
  await advance(request, 400);
  await page.reload();
  await expect(gauge(drive, 'Thrust')).toHaveText('14,400 N');
  await expect(gauge(drive, 'Propellant flow')).toHaveText('0.288 kg/s');
  await expect(gauge(drive, 'Acceleration')).toHaveText('0.0036 m/s²');
  await expect(gauge(drive, 'Velocity')).toHaveText('0.72 m/s');
  await expect(gauge(drive, 'Distance')).toHaveText('72 m');
  await expect(gauge(drive, 'Drive power')).toHaveText('600.0 MW');

  // The router allocated the drive its 600 MW, so Safety raised no alarm.
  await page.goto('/systems/safety');
  await expect(page.getByText('No alarms')).toBeVisible();
  expect(seen).toEqual([]);
});
