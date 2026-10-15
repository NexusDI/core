import {
  type RouteConfig,
  route,
  layout,
  index,
} from '@react-router/dev/routes';

export default [
  layout('./routes/layout.tsx', [
    index('./routes/home.tsx'),
    route('sectors/:sector', './routes/sectors.tsx'),
  ]),
] satisfies RouteConfig;
