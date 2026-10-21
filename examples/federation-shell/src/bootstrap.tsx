import { NexusProvider } from '@nexusdi/react';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { createShip } from './ship/ship';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

const ship = createShip();

createRoot(container, {
  // A workaround: @nexusdi/react's SectionBoundary throws an internal
  // LoadFailure marker, which React would log in place of the load error.
  // A separate @nexusdi/react fix addresses it, and this no-op goes when
  // that fix merges. Until then each station's onError logs the load error
  // itself (src/routes).
  onCaughtError: () => undefined,
}).render(
  <StrictMode>
    <Suspense fallback={<p>Starting the ship...</p>}>
      <NexusProvider container={ship}>
        <App />
      </NexusProvider>
    </Suspense>
  </StrictMode>,
);
