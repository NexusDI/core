import { Suspense, useEffect } from 'react';
import { Await } from 'react-router';

import { BRIDGE_LINK, type IBridgeLink } from '../bridge/bridge-link';
import { WATCH_LOG } from '../bridge/contracts';
import { Section } from '../components';
import { di } from '../nexus.server';
import type { Route } from './+types/course';

/**
 * The loader returns the watch log at once and the backend's answer
 * unawaited, so React Router streams the answer after the shell. The
 * request's scope stays open until the body ends, so the link's call runs
 * in it.
 */
export const loader: (args: Route.LoaderArgs) => Promise<{
  watch: readonly string[];
  flight: ReturnType<IBridgeLink['course']>;
}> = di.inject(
  { log: WATCH_LOG, link: BRIDGE_LINK },
  ({ log, link }, { params }: Route.LoaderArgs) => {
    log.record('docked');
    return { watch: log.entries(), flight: link.course(params.to) };
  },
);

/**
 * Sets `data-flight-log` on the html element once React commits the
 * flight log on the client. React runs the effect on both paths: when it
 * hydrates the streamed answer, and when it renders the boundary on the
 * client. The e2e suite waits on the attribute.
 */
function FlightLogCommitted() {
  useEffect(() => {
    document.documentElement.dataset.flightLog = 'committed';
  }, []);
  return null;
}

export default function Course({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">
          Watch log
        </h2>
        <ul>
          {loaderData.watch.map((entry, at) => (
            <li key={`${at} ${entry}`}>{entry}</li>
          ))}
        </ul>
      </Section>
      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">
          Flight log
        </h2>
        <Suspense fallback={<p>Calling the bridge</p>}>
          <Await
            resolve={loaderData.flight}
            errorElement={<p>The bridge did not answer.</p>}
          >
            {({ course, entries }) => (
              <>
                <FlightLogCommitted />
                <p>{`${course.to}: heading ${course.heading}`}</p>
                <ul>
                  {entries.map((entry, at) => (
                    <li key={`${at} ${entry}`}>{entry}</li>
                  ))}
                </ul>
              </>
            )}
          </Await>
        </Suspense>
      </Section>
    </>
  );
}
