import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { ConsoleFrame, Marker, Notice, Panel } from './index.js';

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
      ],
    });
    const classes = flatten(tree)
      .map((element) => element.props['className'])
      .filter((value): value is string => typeof value === 'string');

    expect(classes).toContain('meridian-panel');
    expect(classes).toContain('meridian-notice meridian-notice--note');
    expect(classes).toContain('meridian-console');
  });
});
