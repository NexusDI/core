import { ScopeProvider } from '@nexusdi/react';
import { Form } from 'react-router';
import { FLIGHT_LOG, MISSION, NAV_CHARTS } from '@nexusdi/bridge-api/contracts';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Section,
} from '../components';
import { CoursePlotter } from '../components/CoursePlotter';
import { di } from '../nexus.server';
import type { Route } from './+types/home';

export const loader = di.inject(
  { log: FLIGHT_LOG, mission: MISSION, charts: NAV_CHARTS },
  ({ log, mission, charts }) => {
    log.record('docked');
    return {
      mission: mission.id,
      course: charts.plot(mission.target),
      entries: log.entries(),
    };
  },
);

export const action: (
  args: Route.ActionArgs,
) => Promise<{ entries: readonly string[] }> = di.inject(
  { log: FLIGHT_LOG },
  async ({ log }, { request }: Route.ActionArgs) => {
    const entry = String((await request.formData()).get('entry') ?? '');
    log.record(entry);
    return { entries: log.entries() };
  },
);

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
              {`${loaderData.course.to}: heading ${loaderData.course.heading}`}
            </p>
          </CardContent>
        </Card>
      </Section>
      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">
          Flight log
        </h2>
        <ul>
          {entries.map((entry) => (
            <li key={entry}>{entry}</li>
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
          <CoursePlotter />
        </ScopeProvider>
      </Section>
    </>
  );
}
