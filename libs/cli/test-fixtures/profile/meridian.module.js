import { Token, defineModule, provide } from '@nexusdi/core';

export const REACTOR_CORE = new Token('ReactorCore');
export const NAV_CHARTS = new Token('NavCharts');

class FusionReactor {
  output() {
    return 1.21;
  }
}

export const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR_CORE, { useClass: FusionReactor })],
  exports: [REACTOR_CORE],
});

export const Tactical = defineModule({
  name: 'Tactical',
  imports: [Engineering],
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (core) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { sector: () => core.output() };
      },
      deps: [REACTOR_CORE],
    }),
  ],
  exports: [NAV_CHARTS],
});

export const Hung = defineModule({
  name: 'Hung',
  providers: [
    provide(NAV_CHARTS, { useFactory: () => new Promise(() => undefined) }),
  ],
});

export const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });
export default Meridian;
