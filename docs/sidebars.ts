import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: ['getting-started/index', 'getting-started/typescript-setup'],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/index',
        'dependency-injection',
        'di-vs-imports',
        'best-practices/index',
      ],
    },
    {
      type: 'category',
      label: 'Modules',
      items: [
        'modules/index',
        'modules/module-basics',
        'modules/module-patterns',
        'modules/dynamic-modules',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api-reference/index',
        'api-reference/container',
        'api-reference/decorators',
        'api-reference/dynamic-module',
        'api-reference/guards',
        'api-reference/types',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      collapsed: true,
      items: [
        'advanced/index',
        'advanced/async-patterns',
        'advanced/resource-cleanup',
        'advanced/native-decorators',
        'advanced/performance',
        'advanced/bundle-optimization',
        'advanced/testing-with-di',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: ['examples/real-world-scenarios'],
    },
    {
      type: 'category',
      label: 'Contributing',
      items: ['contributing/index', 'contributing/code', 'contributing/docs'],
    },
    {
      type: 'category',
      label: 'Roadmap',
      items: ['roadmap/future-features'],
    },
    'faq',
    'terminology',
  ],

  // But you can create a sidebar manually
  /*
  tutorialSidebar: [
    'intro',
    'hello',
    {
      type: 'category',
      label: 'Tutorial',
      items: ['tutorial-basics/create-a-document'],
    },
  ],
   */
};

export default sidebars;
