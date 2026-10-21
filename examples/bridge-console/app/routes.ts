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
  ]),
] satisfies RouteConfig;
