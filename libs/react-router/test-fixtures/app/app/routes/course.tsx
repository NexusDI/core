import { Suspense } from 'react';
import { Await, useLoaderData } from 'react-router';

import { di } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';
import type { Route } from './+types/course';

export const loader = di.inject(
  { log: FLIGHT_LOG },
  ({ log }, { params, request }: Route.LoaderArgs) => {
    log.record(`plotting ${params.to}`);
    const delay = Number(new URL(request.url).searchParams.get('delay') ?? 50);
    const late = new Promise<string>((resolve) =>
      setTimeout(() => {
        log.record('course locked');
        resolve([...log.entries()].sort().join(' | '));
      }, delay),
    );
    return { to: params.to, late };
  },
);

export default function Course() {
  const { to, late } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>{to}</h1>
      <Suspense fallback={<p>plotting</p>}>
        <Await resolve={late}>{(entries) => <p id="log">{entries}</p>}</Await>
      </Suspense>
    </main>
  );
}
