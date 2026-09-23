import base from './docusaurus.config';

/**
 * The 0.3 site under /v0.3/ after 0.4.0 final (spec §15.2 step 4). No blog:
 * the posts move to the new site, and the navbar sends a reader there.
 */
const [[preset, options]] = base.presets as [[string, Record<string, unknown>]];

const items = (base.themeConfig.navbar?.items ?? []).filter(
  (item) => !('to' in item && item.to === '/blog'),
);

export default {
  ...base,
  baseUrl: '/v0.3/',
  noIndex: true,
  presets: [[preset, { ...options, blog: false }]],
  themeConfig: {
    ...base.themeConfig,
    navbar: {
      ...base.themeConfig.navbar,
      items: [
        ...items,
        {
          href: 'https://nexus.js.org/blog/',
          label: 'Blog',
          position: 'right',
        },
      ],
    },
    announcementBar: {
      id: 'v0-3-deprecated',
      isCloseable: false,
      content:
        'This is the documentation for NexusDI 0.3, which is deprecated. The current documentation is at <a href="https://nexus.js.org/">nexus.js.org</a>, and the upgrade guide is at <a href="https://nexus.js.org/upgrade/">nexus.js.org/upgrade/</a>.',
    },
  },
};
