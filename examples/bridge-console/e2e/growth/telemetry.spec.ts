import type { ShipReading } from '@nexusdi/meridian-systems';

import { GROWTH_PORTS } from '../../playwright.servers.mts';
import { expect, problems, test } from '../support';

/** The bridge API the growth config starts. */
const bridgeApi = `http://127.0.0.1:${GROWTH_PORTS.api}`;

test("follows the ship's telemetry in the status strip on /diagnostics", async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The API server keeps its ship across retries, so the case starts from
  // the tick the ship holds now. The idle ship keeps its habitat air.
  const { tick } = (await (
    await request.get(`${bridgeApi}/sim`)
  ).json()) as ShipReading;
  // The strip subscribes after hydration, so the console's /telemetry route
  // answers once the backend's stream has started.
  const stream = page.waitForResponse(/\/telemetry$/);
  await page.goto('/diagnostics');
  const strip = page.getByRole('status', { name: 'Ship status' });
  await expect(strip.getByText('Tick')).toBeVisible();
  await expect(strip.locator('dd').first()).toHaveText(String(tick));
  expect((await stream).status()).toBe(200);

  const advance = await request.post(`${bridgeApi}/sim/advance`, {
    data: { ticks: 600 },
  });
  expect(advance.status()).toBe(200);

  // The page never reloads: these values reach it as telemetry frames.
  await expect(strip.locator('dd')).toHaveText([
    String(tick + 600),
    `${(tick + 600) / 2} s`,
    '293 K',
    '101.3 kPa',
  ]);
  expect(seen).toEqual([]);
});

test("lists the ship's modules on /diagnostics with the telemetry feed's system note", async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto('/diagnostics');
  for (const name of ['Simulation', 'MeridianSystems', 'Telemetry'])
    await expect(
      page.getByRole('heading', { level: 3, name, exact: true }),
    ).toBeVisible();
  const telemetry = page.getByRole('region', {
    name: 'Telemetry',
    exact: true,
  });
  await expect(
    telemetry.getByRole('listitem').filter({ hasText: 'TelemetryFeed' }),
  ).toContainText('system: Telemetry');
  expect(seen).toEqual([]);
});
