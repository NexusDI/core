// @vitest-environment node
import {
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { html } from '../test-support/html.js';
import {
  lazySection,
  NexusProvider,
  ScopeProvider,
  SectionBoundary,
  useService,
} from './index.js';

interface Mission {
  id: string;
  target: string;
}
const MISSION = new Token<Mission>('Mission');

function MissionId() {
  return <p>{useService(MISSION).id}</p>;
}

describe('server rendering', () => {
  it('resolves scoped tokens from the scope prop', async () => {
    await using ship = await Nexus.create([
      provide(MISSION, {
        useFactory: (r: NexusRequest) =>
          (r as unknown as { mission: Mission }).mission,
        deps: [REQUEST],
        lifetime: 'scoped',
      }),
    ]);
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } } as never,
    });
    expect(
      await html(
        <NexusProvider container={ship} scope={scope}>
          <MissionId />
        </NexusProvider>,
      ),
    ).toContain('survey-7');
  });

  it('renders fallbacks for ScopeProvider, SectionBoundary and clientOnly', async () => {
    await using ship = await Nexus.create([]);
    const section = lazySection('navigation', async () => {
      throw new Error('must not load on the server');
    });
    const out = await html(
      <>
        <NexusProvider container={ship}>
          <ScopeProvider fallback={<p>Docking</p>}>
            <p>never</p>
          </ScopeProvider>
          <SectionBoundary section={section} fallback={<p>Loading section</p>}>
            <p>never</p>
          </SectionBoundary>
        </NexusProvider>
        <NexusProvider
          container={ship}
          clientOnly
          fallback={<p>Console skeleton</p>}
        >
          <p>never</p>
        </NexusProvider>
      </>,
    );
    expect(out).toContain('Docking');
    expect(out).toContain('Loading section');
    expect(out).toContain('Console skeleton');
    expect(out).not.toContain('never');
  });
});
