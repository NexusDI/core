import { expect, problems, test } from '../support';

/** The bridge API the growth config starts (playwright.e2e-growth.config.mts). */
const bridgeApi = 'http://127.0.0.1:4221';

test("follows the ship's telemetry in the status strip on /diagnostics", async ({
  page,
  request,
}) => {
  const seen = problems(page);
  // The strip subscribes after hydration, so the console's /telemetry route
  // answers once the backend's stream has started.
  const stream = page.waitForResponse(/\/telemetry$/);
  await page.goto('/diagnostics');
  const strip = page.getByRole('status', { name: 'Ship status' });
  await expect(strip.getByText('Tick')).toBeVisible();
  await expect(strip.locator('dd').first()).toHaveText('0');
  expect((await stream).status()).toBe(200);

  const advance = await request.post(`${bridgeApi}/sim/advance`, {
    data: { ticks: 600 },
  });
  expect(advance.status()).toBe(200);

  // The page never reloads: these values reach it as telemetry frames.
  await expect(strip.locator('dd')).toHaveText([
    '600',
    '300 s',
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
