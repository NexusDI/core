import type { Route } from './+types/home';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Bridge console' }];
}

export default function Home() {
  return <h1>Bridge console</h1>;
}
