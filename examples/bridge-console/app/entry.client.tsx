import { NexusProvider } from '@nexusdi/react';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import { shipReady } from './ship.client';

// The container exists before hydration starts, so the hydration render
// reads services at once and matches the server HTML.
const ship = await shipReady;
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <NexusProvider container={ship}>
        <HydratedRouter />
      </NexusProvider>
    </StrictMode>,
  );
});
