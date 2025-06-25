import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type { ThemeConfig } from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config & { themeConfig: ThemeConfig } = {
  title: 'NexusDI',
  tagline: 'A modern, simple to use DI container for TypeScript',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://nexus.js.org',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'NexusDI', // Usually your GitHub org/user name.
  projectName: 'core', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: {
          showReadingTime: true,
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/nexusdi-social-card.svg',
    navbar: {
      title: 'NexusDI',
      logo: {
        alt: 'NexusDI Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          to: '/docs/getting-started',
          label: 'Docs',
          position: 'left',
        },
        { to: '/docs/advanced', label: 'Advanced', position: 'left' },
        { to: '/docs/faq', label: 'FAQ', position: 'left' },
        { to: '/blog', label: 'Blog', position: 'right' },
        {
          href: 'https://github.com/NexusDI/core',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/getting-started' },
            { label: 'Advanced Usage', to: '/docs/advanced' },
            { label: 'FAQ', to: '/docs/faq' },
            { label: 'Roadmap', to: '/docs/roadmap' },
          ],
        },
        {
          title: 'Community',
          items: [{ label: 'GitHub', href: 'https://github.com/NexusDI/core' }],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} NexusDI. Feature images from <a href="https://unsplash.com">Unsplash</a>.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  },
};

export default config;
