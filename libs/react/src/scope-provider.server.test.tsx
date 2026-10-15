// @vitest-environment node
import {
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { renderToReadableStream } from 'react-dom/server.edge';
import { describe, expect, it } from 'vitest';

import { NexusProvider, ScopeProvider, useService } from './index.js';

interface Mission {
  id: string;
  target: string;
}
const MISSION = new Token<Mission>('Mission');
const survey: NexusRequest = {
  mission: { id: 'survey-7', target: 'Kepler-442b' },
} as never;

function MissionId() {
  return <p>{useService(MISSION).id}</p>;
}

describe('ScopeProvider on the server', () => {
  it('renders fallback on the server, also under a provider given scope', async () => {
    const events: TraceEvent[] = [];
    await using ship = await Nexus.create(
      [
        provide(MISSION, {
          useFactory: (request: NexusRequest) =>
            (request as unknown as { mission: Mission }).mission,
          deps: [REQUEST],
          lifetime: 'scoped',
        }),
      ],
      { plugins: [trace((event) => events.push(event))] },
    );
    await using request = await ship.createScope({ request: survey });
    const stream = await renderToReadableStream(
      <NexusProvider container={ship} scope={request}>
        <ScopeProvider request={survey} fallback={<p>Docking</p>}>
          <MissionId />
        </ScopeProvider>
      </NexusProvider>,
    );
    const html = await new Response(stream).text();
    expect(html).toContain('Docking');
    expect(events.filter((e) => e.type === 'scope:create').length).toBe(1); // the request scope only
  });
});
