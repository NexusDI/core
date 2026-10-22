import type { ShipReading } from '@nexusdi/meridian-systems';

import { GROWTH_PORTS } from '../../playwright.servers.mts';
import { expect, problems, test } from '../support';

/** The bridge API the growth config starts. */
const bridgeApi = `http://127.0.0.1:${GROWTH_PORTS.api}`;

test('refuses the shields at the idle reactor, then queues the throttle', async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The growth suite shares one manual ship, which keeps its tick across the
  // cases, so the throttle queues for the tick after the one it holds now.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  await page.goto('/systems/engineering');

  // The reactor idles at level 0, so the router has nothing for the grid.
  await page.getByRole('button', { name: 'Raise shields' }).click();
  const refusal = page.getByRole('alert');
  await expect(refusal).toContainText(
    'The shields load needs 200 MW, and the router has 0 MW free beside the loads above it.',
  );
  await expect(refusal).toContainText(
    'Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
  );

  await page.getByLabel('Throttle').fill('1');
  await page.getByRole('button', { name: 'Set throttle' }).click();
  // The ship layout's status strip is a status too, so the case picks the
  // answer by its text.
  await expect(
    page.getByRole('status').filter({ hasText: 'Queued for tick' }),
  ).toHaveText(`Queued for tick ${tick + 1}`);
  expect(seen).toEqual([]);
});
