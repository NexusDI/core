import { expect, test } from '@playwright/test';

import { SHELLS } from './ports.ts';
import { problems } from './support.ts';

const drift = `http://127.0.0.1:${SHELLS.drift}`;
const unshared = `http://127.0.0.1:${SHELLS.unshared}`;

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
    'Cartography',
    'Command',
  ]);
  expect(await seen()).toEqual([]);
});

test('fails the drift build with NEXUS_CONTRACT_VERSION, and again on retry', async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto(`${drift}/charts`);
  const failed = page.getByTestId('section-failed');
  const text =
    'meridian/NavCharts is needed at 2.4.0, and the provider has 2.3.0.';
  await expect(failed).toContainText('NEXUS_CONTRACT_VERSION');
  await expect(failed).toContainText(text);

  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(failed).toContainText('NEXUS_CONTRACT_VERSION');
  await expect(failed).toContainText(text);
  // React logs each error a boundary catches: the first load and the retry.
  expect(await seen()).toEqual([
    expect.stringContaining(text),
    expect.stringContaining(text),
  ]);
});

test('fails the unshared build with NEXUS_CORE_NOT_SHARED', async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto(`${unshared}/charts`);
  const failed = page.getByTestId('section-failed');
  await expect(failed).toContainText('NEXUS_CORE_NOT_SHARED');
  await expect(failed).toContainText(
    'the module Cartography was made by another copy of @nexusdi/core',
  );
  // React logs the error the boundary caught.
  expect(await seen()).toEqual([
    expect.stringContaining('[NEXUS_CORE_NOT_SHARED]'),
  ]);
});
