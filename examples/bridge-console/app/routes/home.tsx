import { REQUEST } from '@nexusdi/core';
import { NAV_CHARTS } from '@nexusdi/meridian-systems/charts';
import { ScopeProvider, useService } from '@nexusdi/react';
import { Form } from 'react-router';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Section,
} from '../components';
import { CoursePlotter } from '../components/CoursePlotter';
import { BRIDGE_LINK, WATCH_LOG } from '../di/contracts';
import { plotOrRefuse } from '../di/uncharted';
import { di } from '../nexus.server';
import type { Route } from './+types/home';

/**
 * The mission's id, the heading to its target star, or to the sector the
 * ship jumped to once it has jumped (the refusal when the console does not
 * chart that sector), and the request's watch log. A snapshot
 * that fails leaves the line on the mission's target.
 */
export const loader = di.inject(
  { log: WATCH_LOG, request: REQUEST, charts: NAV_CHARTS, link: BRIDGE_LINK },
  async ({ log, request, charts, link }) => {
    log.record('docked');
    const ship = await link.snapshot().catch(() => null);
    const ftl = ship?.ftl;
    const star =
      ftl !== undefined && ftl.jumped !== null
        ? ftl.sector
        : request.mission.target;
    return {
      mission: request.mission.id,
      course: plotOrRefuse(charts, star),
      entries: log.entries(),
    };
  },
);

export const action: (
  args: Route.ActionArgs,
) => Promise<{ entries: readonly string[] }> = di.inject(
  { log: WATCH_LOG },
  async ({ log }, { request }: Route.ActionArgs) => {
    const entry = String((await request.formData()).get('entry') ?? '');
    log.record(entry);
    return { entries: log.entries() };
  },
);

/**
 * The plotter over the client graph's charts. It turns the `UnchartedStarError` the
 * charts throw into the `{ refused }` answer the component shows.
 */
function Plotter() {
  const charts = useService(NAV_CHARTS);
  return <CoursePlotter plot={(to) => plotOrRefuse(charts, to)} />;
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const entries = actionData?.entries ?? loaderData.entries;
  return (
    <>
      <Section>
        <Card>
          <CardHeader>
            <CardTitle>Mission</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{loaderData.mission}</p>
            <p>
              {'refused' in loaderData.course
                ? loaderData.course.refused
                : `${loaderData.course.to}: heading ${loaderData.course.heading}`}
            </p>
          </CardContent>
        </Card>
      </Section>
      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">
          Watch log
        </h2>
        <ul>
          {entries.map((entry, at) => (
            <li key={`${at} ${entry}`}>{entry}</li>
          ))}
        </ul>
        <Form method="post">
          <input name="entry" defaultValue="course plotted" />
          <Button type="submit">Record</Button>
        </Form>
      </Section>
      <Section>
        {/* Its own scope, created after hydration: the server sends the fallback. */}
        <ScopeProvider fallback={<p>Warming up the plotter</p>}>
          <Plotter />
        </ScopeProvider>
      </Section>
    </>
  );
}
