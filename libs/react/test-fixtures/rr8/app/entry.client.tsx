import { NexusProvider } from '@nexusdi/react';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import { shipReady } from './ship.client';

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
