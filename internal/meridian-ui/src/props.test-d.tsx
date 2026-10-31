import type { ComponentProps } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import type {
  Alert,
  Button,
  ConsoleFrame,
  HoloLabel,
  Marker,
  Notice,
  Panel,
  Status,
  StatusState,
  Terminal,
} from './index.js';

describe('component props', () => {
  it('takes the console title as a formatted string', () => {
    expectTypeOf<
      ComponentProps<typeof ConsoleFrame>['title']
    >().toEqualTypeOf<string>();
  });

  it('limits the notice kinds to the four labels', () => {
    expectTypeOf<ComponentProps<typeof Notice>['kind']>().toEqualTypeOf<
      'note' | 'exception' | 'warning' | 'ship'
    >();
  });

  it('limits the marker lifetimes to the graph lifetimes', () => {
    expectTypeOf<ComponentProps<typeof Marker>['lifetime']>().toEqualTypeOf<
      'singleton' | 'scoped' | 'transient' | 'none' | undefined
    >();
  });

  it('takes a title and actions on a panel', () => {
    expectTypeOf<ComponentProps<typeof Panel>['title']>().toEqualTypeOf<
      import('react').ReactNode
    >();
    expectTypeOf<ComponentProps<typeof Panel>['actions']>().toEqualTypeOf<
      import('react').ReactNode
    >();
  });

  it('maps a status word to one of six states', () => {
    expectTypeOf<StatusState>().toEqualTypeOf<
      'nominal' | 'active' | 'standby' | 'warning' | 'alarm' | 'offline'
    >();
    expectTypeOf<ComponentProps<typeof Status>['states']>().toEqualTypeOf<
      Readonly<Record<string, StatusState>>
    >();
  });

  it('limits the button variants to four', () => {
    expectTypeOf<ComponentProps<typeof Button>['variant']>().toEqualTypeOf<
      'primary' | 'secondary' | 'hazard' | 'quiet' | undefined
    >();
  });

  it('takes a reason with a computed disabled and an id, and refuses a bare disabled', () => {
    expectTypeOf<{
      reason: string;
      id: string;
      disabled: boolean;
    }>().toExtend<ComponentProps<typeof Button>>();
    expectTypeOf<{ reason: string }>().not.toExtend<
      ComponentProps<typeof Button>
    >();
    expectTypeOf<{ disabled: true }>().not.toExtend<
      ComponentProps<typeof Button>
    >();
    expectTypeOf<{ disabled: false }>().toExtend<
      ComponentProps<typeof Button>
    >();
  });

  it('needs an id on the dialog for its labels', () => {
    expectTypeOf<{
      variant: 'dialog';
      message: string;
    }>().not.toExtend<ComponentProps<typeof Alert>>();
    expectTypeOf<{
      variant: 'dialog';
      id: string;
      message: string;
    }>().toExtend<ComponentProps<typeof Alert>>();
  });

  it('limits an alert to a banner or a dialog', () => {
    expectTypeOf<ComponentProps<typeof Alert>['variant']>().toEqualTypeOf<
      'banner' | 'dialog'
    >();
  });

  it('limits a holographic label to four readouts', () => {
    type Readout = { label: string; value: string };
    const one: Readout = { label: 'a', value: '1' };
    expectTypeOf<readonly [Readout, Readout, Readout, Readout]>().toExtend<
      ComponentProps<typeof HoloLabel>['readouts']
    >();
    expectTypeOf<
      readonly [Readout, Readout, Readout, Readout, Readout]
    >().not.toExtend<ComponentProps<typeof HoloLabel>['readouts']>();
    expectTypeOf(one).toExtend<Readout>();
  });

  it('takes the status table and the lines of a terminal', () => {
    expectTypeOf<
      ComponentProps<typeof Terminal>['title']
    >().toEqualTypeOf<string>();
    expectTypeOf<ComponentProps<typeof Terminal>['states']>().toEqualTypeOf<
      Readonly<Record<string, StatusState>>
    >();
  });
});
