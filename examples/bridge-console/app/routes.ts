import {
  type RouteConfig,
  index,
  layout,
  route,
} from '@react-router/dev/routes';

export default [
  layout('routes/layout.tsx', [
    index('routes/home.tsx'),
    route('sectors/:sector', 'routes/sectors.tsx'),
    route('course/:to', 'routes/course.tsx'),
    route('charts', 'routes/charts.tsx'),
    layout('routes/ship-layout.tsx', [
      route('diagnostics', 'routes/diagnostics.tsx'),
      route('systems/engineering', 'routes/systems/engineering.tsx'),
      route('systems/life-support', 'routes/systems/life-support.tsx'),
      route('systems/safety', 'routes/systems/safety.tsx'),
      route('systems/comms', 'routes/systems/comms.tsx'),
      route('systems/helm', 'routes/systems/helm.tsx'),
      route('systems/ftl', 'routes/systems/ftl.tsx'),
      route('airlock', 'routes/airlock.tsx'),
    ]),
  ]),
  // A resource route outside the page layout: it answers with the stream alone.
  route('telemetry', 'routes/telemetry.ts'),
] satisfies RouteConfig;
