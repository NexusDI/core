import {
  check,
  defineModule,
  type ErrorText,
  type ErrorTextKit,
  isNexusError,
  Nexus,
  type NexusError,
  provide,
} from '@nexusdi/core';
import { coreText } from '@nexusdi/core/text';
import { explain } from '@nexusdi/errors';
import { defineContract, federation } from '@nexusdi/federation';
import { federationText } from '@nexusdi/federation/text';
import { expect, it } from 'vitest';

import { NAV_CHARTS, type INavCharts } from './index.js';
import { MERIDIAN_CONTRACT_VERSION } from './version.js';

/** The fix line of `text`: its `fix`, else the `Fix:` line its message holds. */
const fixLineOf = (text: ErrorText | undefined): string | undefined =>
  text?.fix ?? /^ *Fix: (.+)$/m.exec(text?.message ?? '')?.[1];

const kit: ErrorTextKit = { nearMisses: () => [] };

/** What `rejected` promises or `fn` throws, as an error. */
const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw.');
};

/** The first error of `code` in a blueprint error's list. */
function inner<C extends 'NEXUS_CONTRACT_VERSION' | 'NEXUS_CORE_NOT_SHARED'>(
  error: unknown,
  code: C,
) {
  if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID'))
    throw new Error('Expected a blueprint error.');
  const found = error.errors.find((entry) => isNexusError(entry, code));
  if (found === undefined) throw new Error(`Expected ${code}.`);
  return found as unknown as NexusError & { code: C };
}

const charts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

it('NEXUS_CONTRACT_VERSION names the contract, both versions and a fix line from the federation text', () => {
  // A shell that provides the contract at an older minor than the station needs.
  const contract = defineContract({ key: 'meridian', version: '2.3.0' });
  const navCharts = contract.token<INavCharts>('NavCharts');
  const Tactical = defineModule({
    name: 'Tactical',
    providers: [provide(navCharts, { useValue: charts })],
    exports: [navCharts],
  });
  class SectorRoutes {
    static deps = [NAV_CHARTS] as const;
    constructor(readonly charts: INavCharts) {}
  }
  const Cartography = defineModule({
    name: 'Cartography',
    providers: [SectorRoutes],
  });
  const error = inner(
    thrown(() =>
      check(defineModule({ name: 'Meridian', imports: [Tactical] }), {
        plugins: [federation()],
        load: [{ module: Cartography, imports: [Tactical] }],
      }),
    ),
    'NEXUS_CONTRACT_VERSION',
  );
  expect(error).toMatchObject({
    contract: 'meridian/NavCharts',
    required: MERIDIAN_CONTRACT_VERSION,
    provided: '2.3.0',
  });
  const fix = federationText.NEXUS_CONTRACT_VERSION(
    error as Parameters<typeof federationText.NEXUS_CONTRACT_VERSION>[0],
  ).fix;
  expect(fix).toBeTypeOf('string');
  expect(explain(error, { text: [federationText] })?.fix).toBe(fix);
});

it('NEXUS_CORE_NOT_SHARED names a module made by another copy of core and words the core fix line', async () => {
  // What another copy of core makes: an object with the brand and nothing this copy knows.
  const Remote = Object.defineProperty(
    { name: 'Remote', imports: [], providers: [], exports: [] },
    Symbol.for('nexusdi.definition'),
    { value: true },
  );
  let caught: unknown;
  try {
    await Nexus.create(
      defineModule({ name: 'Shell', imports: [Remote as never] }),
    );
  } catch (error) {
    caught = error;
  }
  const error = inner(caught, 'NEXUS_CORE_NOT_SHARED');
  expect(error).toMatchObject({
    received: 'the module Remote',
    where: 'imported by Shell',
  });
  const entry = coreText.NEXUS_CORE_NOT_SHARED as unknown as (
    error: NexusError,
    view: undefined,
    kit: ErrorTextKit,
  ) => ErrorText;
  const fix = fixLineOf(entry(error, undefined, kit));
  expect(fix).toBeTypeOf('string');
  expect(fixLineOf(explain(error))).toBe(fix);
});
