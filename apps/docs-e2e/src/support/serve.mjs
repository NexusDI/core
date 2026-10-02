import { createPagesServer } from './pages-server.mjs';
import { prepareSite, SITE } from './prepare-site.mjs';

const PORT = 4310;

await prepareSite();
createPagesServer(SITE).listen(PORT, () => {
  console.log(`serving ${SITE} on http://localhost:${PORT}`);
});
