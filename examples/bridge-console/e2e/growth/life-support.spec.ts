import type { ShipReading } from '@nexusdi/meridian-systems';

import { expect, problems, test } from '../support';
import { bridgeApi, gauge, reading } from './ship';

test('brings life support online and reads the heated habitat on /systems/life-support', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The growth cases share one manual ship, which keeps its tick and its
  // setpoints across the cases, so the commands queue for the tick after the
  // one it holds now. Life support has no offline command, so a retry or a
  // repeat finds it online, and the ranges below cover the habitat from 600
  // to 7,200 ticks online.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  const queued = page
    .getByRole('status')
    .filter({ hasText: 'Queued for tick' });

  // A cold reactor sheds life support, so the reactor runs at 0.01 first.
  await page.goto('/systems/engineering');
  await page.getByLabel('Throttle').fill('0.01');
  await page.getByRole('button', { name: 'Set throttle' }).click();
  await expect(queued).toHaveText(`Queued for tick ${tick + 1}`);

  await page.goto('/systems/life-support');
  await page.getByRole('button', { name: 'Bring life support online' }).click();
  await expect(queued).toHaveText(`Queued for tick ${tick + 1}`);

  const advance = await request.post(`${bridgeApi}/sim/advance`, {
    data: { ticks: 600 },
  });
  expect(advance.status()).toBe(200);

  // The model gives the habitat 292.765 K and 101,206 Pa at tick 600, with
  // the heater at 2,346 W. After 7,200 ticks online it reads 292.552 K and
  // 101,007 Pa, and the analyzer adds up to 0.05 K and 20 Pa of noise.
  await page.reload();
  await expect(page.getByText(`Analyzer, tick ${tick + 600}`)).toHaveCount(4);
  const analyzer = page.getByLabel('Habitat analyzer', { exact: true });
  const temperature = gauge(analyzer, 'Temperature');
  const pressure = gauge(analyzer, 'Pressure');
  await expect(temperature).toHaveText(/^\d{3}\.\d K$/);
  expect(await reading(temperature)).toBeGreaterThanOrEqual(292.5);
  expect(await reading(temperature)).toBeLessThanOrEqual(292.8);
  await expect(pressure).toHaveText(/^\d{3}\.\d kPa$/);
  expect(await reading(pressure)).toBeGreaterThanOrEqual(101.0);
  expect(await reading(pressure)).toBeLessThanOrEqual(101.2);

  const heater = gauge(
    page.getByLabel('Habitat heater', { exact: true }),
    'Heater power',
  );
  await expect(heater).toHaveText(/^\d{1,2},\d{3} W$/);
  expect(await reading(heater)).toBeGreaterThanOrEqual(2000);
  expect(await reading(heater)).toBeLessThanOrEqual(5000);
  expect(seen).toEqual([]);
});
