import { layout, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  layout('./routes/bridge.tsx', [route('course/:to', './routes/course.tsx')]),
  route('nav/:sector', './routes/navigation.tsx'),
  route('ambient/nav/:sector', './routes/ambient-navigation.tsx'),
  route('fail', './routes/fail.tsx'),
  route('late', './routes/late.tsx'),
  route('lazy/missing', './routes/missing.tsx'),
  route('gone', './routes/gone.tsx'),
  route('acme', './routes/acme.tsx'),
  route('acme/log.json', './routes/acme-resource.ts'),
  route('log.json', './routes/log-resource.ts'),
] satisfies RouteConfig;
