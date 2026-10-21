import { graph } from '@nexusdi/devtools';
import { useContainer } from '@nexusdi/react';

/**
 * The modules of `graph(ship)`, by name. The panel reads the graph when it
 * renders, so it lists every section loaded before the visit.
 */
export function Diagnostics() {
  const ship = useContainer();
  const { modules } = graph(ship);
  return (
    <section aria-label="diagnostics">
      <h2>Diagnostics</h2>
      <ul>
        {modules.map((module) => (
          <li key={module.id}>{module.name}</li>
        ))}
      </ul>
    </section>
  );
}
