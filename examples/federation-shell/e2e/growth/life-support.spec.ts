import { expect, test } from '@playwright/test';

import { problems } from '../support.ts';
import { advance, order, sim } from './ship.ts';

test('reads the habitat air and sends atmosphere commands from /life-support', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // A fresh bridge-api starts at tick 0 and reaches this case at tick 2,
  // since the engineering and command cases advance it a tick each. The two
  // texts below are the habitat's air on tick 2, analyzer noise included.
  const { tick } = await sim(request);
  expect(tick).toBe(2);
  await page.goto('/life-support');
  await expect(page.getByText(`Telemetry, tick ${tick}`)).toBeVisible();
  const habitat = page
    .getByRole('row')
    .filter({
      has: page.getByRole('rowheader', { name: 'habitat', exact: true }),
    })
    .getByRole('cell');
  await expect(habitat.nth(0)).toHaveText('293.0 K');
  await expect(habitat.nth(1)).toHaveText('101.3 kPa');

  const receipt = page.getByRole('status');
  await order(page, 'Bring life support online');
  await expect(receipt).toHaveText(`Queued for tick ${tick + 1}`);
  await order(page, 'Stop the habitat scrubber');
  await expect(receipt).toHaveText(`Queued for tick ${tick + 1}`);

  await advance(request);
  const { setpoints } = await sim(request);
  expect(setpoints.lifeSupport.online).toBe(true);
  expect(setpoints.lifeSupport.scrubbers.habitat).toBe(false);
  await expect(page.getByText(`Telemetry, tick ${tick + 1}`)).toBeVisible();

  await page.getByRole('link', { name: 'Diagnostics' }).click();
  const modules = page.getByRole('region', { name: 'diagnostics' });
  await expect(
    modules.getByRole('listitem').filter({ hasText: /^LifeSupportStation$/ }),
  ).toHaveCount(1);
  expect(await seen()).toEqual([]);
});
