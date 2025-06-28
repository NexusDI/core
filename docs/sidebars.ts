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
    'getting-started',
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts',
        'dependency-injection',
        'di-vs-imports',
        'best-practices',
      ],
    },
    {
      type: 'category',
      label: 'Container',
      items: ['container/nexus-class', 'container/api-reference'],
    },
    'providers-and-services',
    'tokens',
    'testing',
    {
      type: 'category',
      label: 'Modules',
      items: [
        'modules/module-basics',
        'modules/module-patterns',
        'modules/dynamic-modules',
        'modules/modules',
      ],
    },

    {
      type: 'category',
      label: 'Advanced',
      collapsed: true,
      items: [
        'advanced/advanced-providers-and-factories',
        'advanced/module-inheritance',
        'advanced/multi-injection-and-collections',
        'advanced/scoped-and-transient-lifetimes',
        'advanced/interceptors-and-middleware',
        'advanced/performance-tuning',
        'advanced/debugging-and-diagnostics',
        'advanced/circular-dependencies',
        {
          type: 'category',
          label: 'Utilities 🛠️',
          collapsed: true,
          items: [
            'advanced/performance-utilities',
            'advanced/debugging-utilities',
            'advanced/circular-dependency-utils',
          ],
        },
      ],
    },
    'performance',
    {
      type: 'category',
      label: 'Contributing',
      items: ['contributing/index', 'contributing/code', 'contributing/docs'],
    },
    'faq',
    'roadmap',
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
