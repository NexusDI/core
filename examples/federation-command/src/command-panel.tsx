import { useService } from '@nexusdi/react';
import { useState, useSyncExternalStore } from 'react';

import {
  BURN_BOARD,
  COURSE_PLOTTER,
  HELM_ORDERS,
  REACTOR_ORDERS,
} from './command-station.module';

/**
 * The course the decorated CoursePlotter plots, read from the shell's
 * container, two helm orders and a reactor order sent over the shell's
 * command link, and the burn's allocation read from the shell's telemetry.
 * The status line shows the receipt text the shell words.
 */
export function CommandPanel() {
  const plotter = useService(COURSE_PLOTTER);
  const helm = useService(HELM_ORDERS);
  const reactor = useService(REACTOR_ORDERS);
  const board = useService(BURN_BOARD);
  const telemetry = useSyncExternalStore(board.subscribe, board.state);
  const served = board.served(telemetry);
  const [receipt, setReceipt] = useState('');
  return (
    <section aria-label="command deck">
      <h2>Command deck</h2>
      <p>{plotter.course('Kepler-442b')}</p>
      <button
        type="button"
        onClick={() =>
          void helm.course('Kepler-442b').then((r) => setReceipt(r.text))
        }
      >
        Steer for Kepler-442b
      </button>
      <button
        type="button"
        onClick={() => void helm.burn(0.5).then((r) => setReceipt(r.text))}
      >
        Burn at 0.5
      </button>
      <button
        type="button"
        onClick={() => void reactor.throttle(1).then((r) => setReceipt(r.text))}
      >
        Reactor to full throttle
      </button>
      <p aria-label="Burn allocation">
        Burn served: {served ?? 'waiting for telemetry'}
      </p>
      <p role="status">{receipt}</p>
    </section>
  );
}
