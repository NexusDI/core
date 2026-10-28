import { render, screen } from '@testing-library/react';
import type { Nexus } from '@nexusdi/core';
import { NAV_CHARTS } from '@nexusdi/meridian-systems/charts';
import { NexusProvider } from '@nexusdi/react';
import { nexusTest } from '@nexusdi/vitest';
import { createRoutesStub } from 'react-router';
import { describe, expect, test as base } from 'vitest';

import { BridgeClient } from '../app/di/bridge.client';
import { StarSelect } from '../app/routes/systems/star-select';
import { FakeCharts } from './doubles';

/** A client graph per test whose charts hold the two stars of `FakeCharts`. */
const test = nexusTest(base, BridgeClient, {
  setup: (builder) => builder.override(NAV_CHARTS, { useClass: FakeCharts }),
});

function renderSelect(nexus: Nexus) {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => <StarSelect command="jump" button="Jump" />,
    },
  ]);
  render(
    <NexusProvider container={nexus}>
      <Stub initialEntries={['/']} />
    </NexusProvider>,
  );
}

describe('StarSelect', () => {
  test('lists the stars the charts hold, first one selected', async ({
    nexus,
  }) => {
    renderSelect(nexus);
    const select = await screen.findByRole('combobox', { name: 'Star' });
    expect(select.getAttribute('name')).toBe('to');
    expect(
      [...select.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['Vega', 'Altair']);
    expect((select as HTMLSelectElement).value).toBe('Vega');
  });

  test('posts the command named by its prop', async ({ nexus }) => {
    renderSelect(nexus);
    const button = await screen.findByRole('button', { name: 'Jump' });
    expect(button.getAttribute('name')).toBe('command');
    expect(button.getAttribute('value')).toBe('jump');
  });
});
