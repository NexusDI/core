import { expect, test } from '@playwright/test';

import { problems } from '../support.ts';
import { advance, sim } from './ship.ts';

test('reads the idle reactor over the telemetry stream on /engineering', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  const { tick } = await sim(request);
  await page.goto('/engineering');
  await expect(page.getByText(`Telemetry, tick ${tick}`)).toBeVisible();
  const gauges = page.getByLabel('Engineering gauges');
  await expect(gauges.locator('dt')).toHaveText([
    'Reactor level',
    'Electric output',
    'Coolant',
    'Power allocated',
    'Loads shed',
  ]);
  // The reactor idles at level 0 and the router has nothing to allocate.
  await expect(gauges.locator('dd')).toHaveText([
    '0.00',
    '0.0 MW',
    '500.0 K',
    '0.0 MW',
    'none',
  ]);

  // The stream sends the next tick's reading, and the panel shows it with
  // no reload.
  await advance(request);
  await expect(page.getByText(`Telemetry, tick ${tick + 1}`)).toBeVisible();

  await page.getByRole('link', { name: 'Diagnostics' }).click();
  const modules = page.getByRole('region', { name: 'diagnostics' });
  await expect(
    modules.getByRole('listitem').filter({ hasText: /^EngineeringStation$/ }),
  ).toHaveCount(1);
  expect(await seen()).toEqual([]);
});
