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
    'modules/intro',
    'modules/getting-started',
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'modules/concepts',
        'modules/dependency-injection',
        'modules/tokens',
        'modules/providers-and-services',
        'modules/di-vs-imports',
      ],
    },
    'modules/best-practices',
    {
      type: 'category',
      label: 'Modules',
      items: [
        'modules/modules',
        'modules/module-basics',
        'modules/module-patterns',
        'modules/dynamic-modules',
      ],
    },
    {
      type: 'category',
      label: 'Container',
      items: ['container/nexus-class', 'container/api-reference'],
    },
    {
      type: 'category',
      label: 'Advanced',
      collapsed: false,
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
          collapsed: false,
          items: [
            'advanced/performance-utilities',
            'advanced/debugging-utilities',
            'advanced/circular-dependency-utils',
          ],
        },
      ],
    },
    'modules/testing',
    'modules/performance',
    'modules/faq',
    {
      type: 'doc',
      id: 'modules/roadmap',
      label: 'Roadmap',
    },
    {
      type: 'doc',
      id: 'modules/contributing',
      label: 'Contributing',
    },
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
