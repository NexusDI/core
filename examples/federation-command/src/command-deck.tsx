import { useService } from '@nexusdi/react';
import { useState } from 'react';

import { BRIDGE } from './bridge';
import { HELM_ORDERS } from './helm-orders';

/**
 * The course the decorated Bridge plots, read from the shell's container,
 * and two helm orders sent over the shell's command link. The status line
 * shows the receipt text the shell words.
 */
export function CommandDeck() {
  const bridge = useService(BRIDGE);
  const helm = useService(HELM_ORDERS);
  const [receipt, setReceipt] = useState('');
  return (
    <section aria-label="command deck">
      <h2>Command deck</h2>
      <p>{bridge.course('Kepler-442b')}</p>
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
      <p role="status">{receipt}</p>
    </section>
  );
}
