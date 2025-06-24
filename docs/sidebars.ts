import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

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
      label: 'Core Concepts',
      items: [
        'concepts',
        'dependency-injection',
        'tokens',
        'providers-and-services',
        'di-vs-imports',
        'best-practices'
      ]
    },
    {
      type: 'category',
      label: 'Modules',
      items: [
        'modules',
        'module-basics',
        'module-patterns',
        'dynamic-modules'
      ]
    },
    {
      type: 'category',
      label: 'Advanced',
      collapsed: false,
      items: [
        'advanced/advanced-providers-and-factories',
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
    {
      type: 'category',
      label: 'Container',
      items: [
        'container/nexus-class',
        'container/api-reference',
      ],
    },
    'faq',
    'performance',
    {
      type: 'doc',
      id: 'roadmap',
      label: 'Roadmap',
    },
    {
      type: 'doc',
      id: 'contributing',
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
