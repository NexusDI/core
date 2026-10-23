import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Section } from './Section';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <Section />
  </StrictMode>,
);
