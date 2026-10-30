import { render, screen } from '@testing-library/react';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { describe, expect, test } from 'vitest';

import { StatusStrip } from '../app/components/StatusStrip';
import { shipAtStart } from './doubles';

function strip(ship: ShipReading | null) {
  return render(<StatusStrip ship={ship} />);
}

const status = () => screen.getByRole('status', { name: 'Ship status' });

describe('the status strip', () => {
  test('renders the tick, the ship time and the habitat temperature and pressure', () => {
    strip(shipAtStart);
    expect(status().textContent).toBe(
      'Tick0Ship time0 sHabitat temperature293 KHabitat pressure101.3 kPa',
    );
  });

  test('shows the habitat pressure the reading carries, in kPa', () => {
    const habitat = { ...shipAtStart.compartments.habitat, pressure: 95_420 };
    strip({
      ...shipAtStart,
      compartments: { ...shipAtStart.compartments, habitat },
    });
    expect(screen.getByText('95.4 kPa')).toBeDefined();
  });

  test('shows a warmed habitat in whole kelvin', () => {
    const habitat = { ...shipAtStart.compartments.habitat, temperature: 292.7 };
    strip({
      ...shipAtStart,
      compartments: { ...shipAtStart.compartments, habitat },
    });
    expect(screen.getByText('293 K')).toBeDefined();
  });

  test('renders Telemetry offline with no snapshot', () => {
    strip(null);
    expect(status().textContent).toBe('Telemetry offline');
  });
});
