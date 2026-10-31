import * as React from 'react';
import { describe, expect, it } from 'vitest';

import {
  Alert,
  Button,
  ConsoleFrame,
  HoloLabel,
  HullCrop,
  Marker,
  Notice,
  Panel,
  Schematic,
  Status,
  StepList,
  Switch,
  Terminal,
} from './index.js';

type Element = React.ReactElement<Record<string, unknown>>;

function flatten(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...flatten(element.props['children'] as React.ReactNode)];
}

describe('the react-server export condition', () => {
  it('is active, so a stateful import would fail here', () => {
    const react = React as unknown as Record<string, unknown>;
    expect(react['useState']).toBeUndefined();
    expect(react['createContext']).toBeUndefined();
  });
});

describe('@nexusdi/meridian-ui under react-server', () => {
  it('renders every component by calling it', () => {
    const tree = Panel({
      children: [
        Notice({
          kind: 'note',
          children: 'A scoped provider is built once per scope.',
        }),
        ConsoleFrame({ title: 'Graph', children: Marker({ shape: 'corner' }) }),
        Terminal({
          title: 'Log',
          states: { ok: 'nominal' },
          lines: [{ tick: 't 1', source: 'helm', message: 'ok', status: 'ok' }],
        }),
        Button({ variant: 'primary', children: 'Run' }),
        Status({ word: 'ok', states: { ok: 'nominal' } }),
        Alert({ variant: 'banner', code: 'HYPOXIA', subject: 'airlock' }),
        HoloLabel({ title: 'Core', readouts: [{ label: 'MW', value: 1 }] }),
        HullCrop({
          full: [0, 0, 10, 10],
          crop: [0, 0, 5, 5],
          transitionName: 'crop',
          children: Schematic({ markup: '<svg viewBox="0 0 10 10"></svg>' }),
        }),
        Switch({
          name: 'n',
          value: 'v',
          label: 'L',
          onWord: 'on',
          offWord: 'off',
        }),
        StepList({ steps: [{ id: 'a', label: 'A' }], current: 'a' }),
      ],
    });
    const classes = flatten(tree)
      .map((element) => element.props['className'])
      .filter((value): value is string => typeof value === 'string');

    expect(classes).toContain('meridian-panel');
    expect(classes).toContain('meridian-notice meridian-notice--note');
    expect(classes).toContain('meridian-console');
    expect(classes).toContain('meridian-terminal__log');
    expect(classes).toContain('meridian-button meridian-button--primary');
    expect(classes).toContain(
      'meridian-alert meridian-alert--banner meridian-alert--alarm',
    );
    expect(classes).toContain('meridian-holo');
    expect(classes).toContain('meridian-hull-crop');
    expect(classes).toContain('meridian-schematic');
    expect(classes).toContain('meridian-switch');
    expect(classes).toContain('meridian-steps');
  });
});
