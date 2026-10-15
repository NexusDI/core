import { createPagesServer } from './pages-server.mjs';
import { prepareSite, SITE } from './prepare-site.mjs';

import { PORT } from './port.mjs';

await prepareSite();
createPagesServer(SITE).listen(PORT, () => {
  console.log(`serving ${SITE} on http://localhost:${PORT}`);
});
