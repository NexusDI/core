import { NexusProvider } from '@nexusdi/react';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { createShip } from './ship/ship';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

const ship = createShip();

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={<p>Starting the ship...</p>}>
      <NexusProvider container={ship}>
        <App />
      </NexusProvider>
    </Suspense>
  </StrictMode>,
);
