import { expect, test, type Page } from '@playwright/test';
import { MERIDIAN_CONTRACT_VERSION } from '@nexusdi/federation-contracts/version';

import { SHELLS } from './ports.ts';
import { problems } from './support.ts';

const drift = `http://127.0.0.1:${SHELLS.drift}`;
const unshared = `http://127.0.0.1:${SHELLS.unshared}`;

/** The drift build's contract version: the next minor of the shell's. */
const [major, minor] = MERIDIAN_CONTRACT_VERSION.split('.').map(Number);
const driftVersion = `${major}.${minor + 1}.0`;

/**
 * The command panel reads the burn from the telemetry stream, and these runs
 * start no bridge-api. The stream answers an empty feed, so the page logs no
 * refused connection.
 */
async function idleTelemetry(page: Page): Promise<void> {
  await page.route('**/telemetry', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: ': no bridge-api\n\n',
    }),
  );
}

test('renders the bridge with no console error', async ({ page }) => {
  const seen = problems(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Meridian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bridge' })).toBeVisible();
  expect(await seen()).toEqual([]);
});

test("plots Kepler-442b through the cartography remote's copy of NAV_CHARTS", async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto('/charts');
  await expect(page.getByText('Kepler-442b: heading 42')).toBeVisible();
  expect(await seen()).toEqual([]);
});

test('shows the course the decorated Bridge plots through its @Inject accessor', async ({
  page,
}) => {
  await idleTelemetry(page);
  const seen = problems(page);
  await page.goto('/command');
  await expect(
    page.getByText('course to Kepler-442b, heading 42'),
  ).toBeVisible();
  expect(await seen()).toEqual([]);
});

test('lists both sections among the modules of graph(ship) after they load', async ({
  page,
}) => {
  await idleTelemetry(page);
  const seen = problems(page);
  await page.goto('/charts');
  await expect(page.getByText('Kepler-442b: heading 42')).toBeVisible();
  await page.getByRole('link', { name: 'Command' }).click();
  await expect(
    page.getByText('course to Kepler-442b, heading 42'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Diagnostics' }).click();
  const modules = page.getByRole('region', { name: 'diagnostics' });
  await expect(modules.getByRole('listitem')).toContainText([
    'Meridian',
    'Tactical',
    'CartographyStation',
    'CommandStation',
  ]);
  expect(await seen()).toEqual([]);
});

test('fails the drift build with NEXUS_CONTRACT_VERSION, and again on retry', async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto(`${drift}/charts`);
  const failed = page.getByTestId('section-failed');
  const text = `meridian/NavCharts is needed at ${driftVersion}, and the provider has ${MERIDIAN_CONTRACT_VERSION}.`;
  await expect(failed).toContainText('NEXUS_CONTRACT_VERSION');
  await expect(failed).toContainText(text);

  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(failed).toContainText('NEXUS_CONTRACT_VERSION');
  await expect(failed).toContainText(text);
  // React logs a NEXUS_REACT_SECTION_FAILED that quotes the load error:
  // once for the first load, once for the retry.
  const logs = await seen();
  expect(logs).toHaveLength(2);
  for (const log of logs) {
    expect(log).toMatch(
      /^\[NEXUS_REACT_SECTION_FAILED\] Section 'cartography'/,
    );
    expect(log).toContain(text);
  }
});

test('fails the unshared build with NEXUS_CORE_NOT_SHARED', async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto(`${unshared}/charts`);
  const failed = page.getByTestId('section-failed');
  await expect(failed).toContainText('NEXUS_CORE_NOT_SHARED');
  await expect(failed).toContainText(
    'the module CartographyStation was made by another copy of @nexusdi/core',
  );
  await expect(failed).toContainText(
    'In Module Federation, share @nexusdi/core with singleton: true.',
  );
  // React logs a NEXUS_REACT_SECTION_FAILED that quotes the load error.
  expect(await seen()).toEqual([
    expect.stringMatching(
      /^\[NEXUS_REACT_SECTION_FAILED\] Section 'cartography'[^]*\[NEXUS_CORE_NOT_SHARED\]/,
    ),
  ]);
});
