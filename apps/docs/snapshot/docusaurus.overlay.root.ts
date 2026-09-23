import { join } from 'node:path';

import base from './docusaurus.config';
import { announcementBar, newestPublishedPost } from './announcement.mjs';

/**
 * The 0.3 site at the root during the RC (spec §15.2 step 4). It keeps the
 * original config and adds the announcement bar once a published RC post
 * sits in blog/. `docusaurus build` runs from the site directory, so
 * process.cwd() is snapshot-src/docs.
 */
const bar = announcementBar(newestPublishedPost(join(process.cwd(), 'blog')));

export default {
  ...base,
  baseUrl: '/',
  themeConfig: {
    ...base.themeConfig,
    ...(bar ? { announcementBar: bar } : {}),
  },
};
