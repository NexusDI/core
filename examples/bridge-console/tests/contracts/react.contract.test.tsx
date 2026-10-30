import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import {
  NexusProvider,
  TransientInRenderError,
  useService,
} from '@nexusdi/react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { BridgeClient, bridgeClientPlugins } from '../../app/di/bridge.client';
import { BridgeConsole, bridgeServerPlugins } from '../../app/di/bridge.server';

interface ISurveyDrone {
  launch(): string;
}
const SURVEY_DRONE = new Token<ISurveyDrone>('SurveyDrone');
class ScoutDrone implements ISurveyDrone {
  launch() {
    return 'scout away';
  }
}

const withDrone = (lifetime: 'transient' | 'singleton') =>
  defineModule({
    name: 'WithDrone',
    imports: [],
    providers: [provide(SURVEY_DRONE, { useClass: ScoutDrone, lifetime })],
    exports: [SURVEY_DRONE],
  });

it('NEXUS_REACT_TRANSIENT_IN_RENDER names the transient survey drone in render on both console graphs, with a fix line, and the singleton reads clean', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  for (const [graph, plugins] of [
    [BridgeClient, bridgeClientPlugins],
    [BridgeConsole, bridgeServerPlugins],
  ] as const) {
    const root = (lifetime: 'transient' | 'singleton') =>
      defineModule({
        name: 'Probe',
        imports: [graph, withDrone(lifetime)],
      });
    const Reader = () => <p>{useService(SURVEY_DRONE).launch()}</p>;
    const view = (ship: Nexus) => (
      <NexusProvider container={ship}>
        <Reader />
      </NexusProvider>
    );

    await using broken = await Nexus.create(root('transient'), { plugins });
    let error: unknown;
    try {
      render(view(broken));
    } catch (thrown) {
      error = thrown;
    }
    expect(isNexusError(error, 'NEXUS_REACT_TRANSIENT_IN_RENDER')).toBe(true);
    expect(error).toBeInstanceOf(TransientInRenderError);
    expect(error).toMatchObject({
      token: 'SurveyDrone',
      provider: 'ScoutDrone',
    });
    // The fix names the hook and the lifetime that resolve it. @nexusdi/react
    // exports no text pack, so a regex reads the line until NexusDI/core#264.
    expect((error as Error).message).toMatch(
      /^ *Fix: .*useContainer\(\).*scoped.*ScopeProvider/m,
    );

    await using fixed = await Nexus.create(root('singleton'), { plugins });
    const ok = render(view(fixed));
    expect(ok.container.textContent).toBe('scout away');
    ok.unmount();
  }
});
