import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The standalone page of the remote. The shell on port 4300 loads its
// section; this page only says where to look.
const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <p>
      federation-command is a remote of the Meridian shell. Open the shell on
      port 4300.
    </p>
  </StrictMode>,
);
