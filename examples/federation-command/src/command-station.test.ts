import { Nexus, defineModule, isNexusError, provide } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import { NAV_CHARTS } from '@nexusdi/federation-contracts';
import {
  FAKE_HEADING,
  FixedNavCharts,
  RECORDED_TICK,
  RECORDING_LINK,
  stationRoot,
} from '@nexusdi/federation-contracts/testing';
import { nexusTest } from '@nexusdi/vitest';
import { describe, expect, test as base } from 'vitest';

import {
  COURSE_PLOTTER,
  CommandStation,
  CoursePlotter,
  HELM_ORDERS,
  HelmOrders,
} from './command-station.module';

const root = stationRoot(CommandStation);
const test = nexusTest(base, root);

/** The error `fn` throws. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw.');
}

describe('CommandStation', () => {
  test('builds CoursePlotter, whose @Inject accessor reads the contract charts', ({
    nexus,
  }) => {
    const plotter = nexus.get(COURSE_PLOTTER);
    expect(plotter).toBeInstanceOf(CoursePlotter);
    expect(plotter.course('Kepler-442b')).toBe(
      `course to Kepler-442b, heading ${FAKE_HEADING}`,
    );
  });

  test('passes Nexus.check with federation()', () => {
    expect(() => Nexus.check(root, { plugins: [federation()] })).not.toThrow();
  });

  test('builds HelmOrders through @Injectable and sends helm orders over COMMAND_LINK', async ({
    nexus,
  }) => {
    const helm = nexus.get(HELM_ORDERS);
    expect(helm).toBeInstanceOf(HelmOrders);
    expect(await helm.course('Kepler-442b')).toEqual({
      queued: true,
      tick: RECORDED_TICK,
      text: 'queued',
    });
    await helm.burn(0.5);
    expect(nexus.get(RECORDING_LINK).sent).toEqual([
      { system: 'helm', action: 'course', to: 'Kepler-442b' },
      { system: 'helm', action: 'burn', level: 0.5 },
    ]);
  });

  test('fails Nexus.check with NEXUS_MISSING_PROVIDER when no COMMAND_LINK is provided', () => {
    const ChartsOnly = defineModule({
      name: 'Tactical',
      providers: [provide(NAV_CHARTS, { useClass: FixedNavCharts })],
      exports: [NAV_CHARTS],
      global: true,
    });
    const withoutLink = defineModule({
      name: 'Meridian',
      imports: [ChartsOnly, CommandStation],
    });
    const error = caught(() =>
      Nexus.check(withoutLink, { plugins: [federation()] }),
    );
    if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID'))
      throw new Error('Expected NEXUS_BLUEPRINT_INVALID.');
    expect(error.errors).toHaveLength(1);
    const [missing] = error.errors;
    expect(isNexusError(missing, 'NEXUS_MISSING_PROVIDER')).toBe(true);
    expect(String(missing)).toContain('meridian/CommandLink');
  });
});
