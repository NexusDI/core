import { useService } from '@nexusdi/react';

import { BRIDGE } from './bridge';

/** The course the decorated Bridge plots, read from the shell's container. */
export function CommandDeck() {
  const bridge = useService(BRIDGE);
  return (
    <section aria-label="command deck">
      <h2>Command deck</h2>
      <p>{bridge.course('Kepler-442b')}</p>
    </section>
  );
}
