import { createServer } from 'node:http';

import { pagesHandler } from './pages-server.mjs';
import { CHECKOUT, CHECKOUT_PATH, PORT } from './port.mjs';
import { prepareSite, SITE } from './prepare-site.mjs';

await prepareSite();

const pages = pagesHandler(SITE);
createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== CHECKOUT_PATH) return pages(request, response);
  // 200 for this checkout's id, which Playwright's `webServer.url` carries,
  // and 409 for another checkout's, which then starts its own server.
  const ours = url.searchParams.get('checkout') === CHECKOUT;
  response.writeHead(ours ? 200 : 409, { 'Content-Type': 'text/plain' });
  response.end(CHECKOUT);
})
  .on('error', (error) => {
    if (error.code !== 'EADDRINUSE') throw error;
    console.error(
      `Port ${PORT} is taken by a server that is not this checkout's docs e2e server (checkout ${CHECKOUT}). Stop that server, or set DOCS_E2E_PORT to a free port.`,
    );
    process.exit(1);
  })
  .listen(PORT, () => {
    console.log(`serving ${SITE} on http://localhost:${PORT}`);
  });
