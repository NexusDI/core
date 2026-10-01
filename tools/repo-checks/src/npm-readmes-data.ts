/**
 * What the npm README standard fixes per package: the kind, the tagline,
 * whether the install line uses -D, and the region names each package
 * carried at 0.4.0-rc.0. npm-readmes.ts holds the rules, this file the
 * values they compare against.
 */

export type Kind = 'core' | 'sub-package' | 'cli' | 'root';

export const PACKAGES = [
  'core',
  'decorators',
  'devtools',
  'errors',
  'federation',
  'interceptors',
  'node',
  'testing',
  'cli',
] as const;

export type Package = (typeof PACKAGES)[number];

export interface PackageSpec {
  readonly kind: Exclude<Kind, 'root'>;
  /** The one line under the H1 (core: inside the hero). */
  readonly tagline: string;
  /** The install line is `npm install -D ...`. */
  readonly dev: boolean;
  /** Every region name the package's README carried at 0.4.0-rc.0. */
  readonly regions: readonly string[];
}

export const SPECS: Readonly<Record<Package, PackageSpec>> = {
  core: {
    kind: 'core',
    tagline:
      'NestJS-style modules and async startup for any TypeScript app, checked before it runs, with no compiler flags.',
    dev: false,
    regions: [
      'quick-start',
      'interfaces-and-tokens',
      'providers',
      'provider-literals',
      'modules',
      'configurable-module',
      'configurable-module-async',
      'scopes',
      'scope-extend',
      'lifecycle',
      'startup-cost',
      'lazy',
      'errors',
      'error-message',
      'plugins',
      'plugin-canonical',
    ],
  },
  decorators: {
    kind: 'sub-package',
    tagline:
      'NestJS-style @Injectable, @Inject and @Module for NexusDI, with standard decorators and no compiler flags.',
    dev: false,
    regions: ['decorators'],
  },
  devtools: {
    kind: 'sub-package',
    tagline:
      'Draw your NexusDI module graph and follow every instance the container builds.',
    dev: false,
    regions: ['graph', 'annotate', 'inspect', 'render', 'parse'],
  },
  errors: {
    kind: 'sub-package',
    tagline:
      'Every NexusDI error explained, with the fix and the provider you probably meant.',
    dev: false,
    regions: ['errors', 'explain'],
  },
  federation: {
    kind: 'sub-package',
    tagline:
      'Share NexusDI tokens between a micro-frontend shell and its remotes through versioned contracts.',
    dev: false,
    regions: ['contracts', 'text'],
  },
  interceptors: {
    kind: 'sub-package',
    tagline:
      'Wrap NexusDI service methods with logging, metrics, validation or caching.',
    dev: false,
    regions: ['intercept', 'text'],
  },
  node: {
    kind: 'sub-package',
    tagline:
      "Find the current request's NexusDI scope anywhere in a Node call chain, through AsyncLocalStorage.",
    dev: false,
    regions: ['node'],
  },
  testing: {
    kind: 'sub-package',
    tagline:
      'Build your real NexusDI module graph in tests, with the providers you name replaced.',
    dev: true,
    regions: ['testing', 'override-lifetime', 'override-module'],
  },
  cli: {
    kind: 'cli',
    tagline:
      "Draw a NexusDI app's dependency graph from the terminal as Mermaid, DOT, JSON, SVG or PNG.",
    dev: true,
    regions: [],
  },
};

export interface KindLimits {
  readonly maxLines: number;
  /** Lines between the fences of the first example. */
  readonly maxFirstExample: number;
  /** Doctest blocks allowed in the README, or null when not counted. */
  readonly doctests: readonly [min: number, max: number] | null;
  /** Bullets the list under the ingress may hold. */
  readonly bullets: readonly number[];
}

export const LIMITS: Readonly<Record<Kind, KindLimits>> = {
  core: {
    maxLines: 200,
    maxFirstExample: 25,
    doctests: [4, 4],
    bullets: [5, 6],
  },
  'sub-package': {
    maxLines: 90,
    maxFirstExample: 25,
    doctests: [1, 2],
    bullets: [2, 4, 5],
  },
  cli: {
    maxLines: 75,
    maxFirstExample: 6,
    doctests: [0, 0],
    bullets: [2, 4, 5],
  },
  // The root copies core's Quick start, which core's doctest already runs.
  root: { maxLines: 220, maxFirstExample: 25, doctests: null, bullets: [5, 6] },
};

/**
 * The H2 headings of each kind, in order. A sub-package may add one H2
 * between Usage and Documentation; `null` marks that slot.
 */
export const HEADINGS: Readonly<Record<Kind, readonly (string | null)[]>> = {
  core: [
    'Quick start',
    'Features',
    'Install',
    'Checked at startup',
    'Modules and interfaces',
    'Configurable modules',
    'Packages',
    'Documentation',
    'When you do not need a container',
    'License',
  ],
  'sub-package': ['Install', 'Usage', null, 'Documentation', 'License'],
  cli: ['Install', 'Usage', 'Options', 'Documentation', 'License'],
  root: [
    'Quick start',
    'Features',
    'Install',
    'Packages',
    'Examples',
    'Contributing',
    'License',
  ],
};

/** The logo URL, the one repo URL that stays on `main`. */
export const LOGO =
  'https://raw.githubusercontent.com/NexusDI/core/main/logo.svg';

/** The graph image devtools and cli show, relative to the repo root. */
export const GRAPH_IMAGE = 'libs/devtools/assets/graph.svg';
