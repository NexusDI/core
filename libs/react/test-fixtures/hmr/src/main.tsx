import type { Nexus } from '@nexusdi/core';
import { NexusProvider } from '@nexusdi/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { shipReady } from './ship';

const app = (ship: Nexus) => (
  <StrictMode>
    <NexusProvider container={ship} dispose>
      <App />
    </NexusProvider>
  </StrictMode>
);

const element = document.getElementById('root');
if (element === null) throw new Error('index.html has no #root');
const root = createRoot(element);
root.render(app(await shipReady));

// react spec 12.1: a service edit creates a new container, and the
// provider disposes the old one after the swap.
import.meta.hot?.accept('./ship', async (next) => {
  if (next) root.render(app(await next.shipReady));
});
