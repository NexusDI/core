import type { NexusGraph } from '@nexusdi/devtools';

import { BRIDGE_LINK } from '../bridge/bridge-link';
import { Section } from '../components';
import { di } from '../nexus.server';
import type { Route } from './+types/diagnostics';

/** The backend's annotated graph, or null when it serves none. */
export const loader: (args: Route.LoaderArgs) => Promise<NexusGraph | null> =
  di.inject({ link: BRIDGE_LINK }, ({ link }) => link.graph());

/**
 * Each module of the backend's graph with the providers it owns and their
 * notes, such as `system: Telemetry`. Plumbing such as core's REQUEST,
 * which every graph lists, stays off the page.
 */
export default function Diagnostics({ loaderData }: Route.ComponentProps) {
  if (loaderData === null)
    return (
      <Section>
        <p>Diagnostics are off on this bridge</p>
      </Section>
    );
  const providers = loaderData.providers.filter(
    (provider) => !provider.internal,
  );
  const modules = loaderData.modules
    .map((module) => ({
      ...module,
      providers: providers.filter((provider) => provider.module === module.id),
    }))
    .filter((module) => module.providers.length > 0);
  return (
    <Section>
      <h2 className="text-2xl font-semibold mb-4 dark:text-white">
        Diagnostics
      </h2>
      {modules.map((module) => (
        <section
          key={module.id}
          aria-labelledby={`module-${module.id}`}
          className="mb-4 dark:text-white"
        >
          <h3 id={`module-${module.id}`} className="text-lg font-semibold">
            {module.name}
          </h3>
          <ul>
            {module.providers.map((provider) => (
              <li key={provider.id}>
                <code>{provider.token}</code>
                {provider.notes.map((note) => (
                  <span
                    key={note}
                    className="ml-2 text-sm text-gray-600 dark:text-gray-400"
                  >
                    {note}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Section>
  );
}
