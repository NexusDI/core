/**
 * What the npm README standard fixes per package: the kind, and whether the
 * install line uses -D. npm-readmes.ts holds the rules, this file the values
 * they compare against.
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
  /** The install line is `npm install -D ...`. */
  readonly dev: boolean;
}

export const SPECS: Readonly<Record<Package, PackageSpec>> = {
  core: { kind: 'core', dev: false },
  decorators: { kind: 'sub-package', dev: false },
  devtools: { kind: 'sub-package', dev: false },
  errors: { kind: 'sub-package', dev: false },
  federation: { kind: 'sub-package', dev: false },
  interceptors: { kind: 'sub-package', dev: false },
  node: { kind: 'sub-package', dev: false },
  testing: { kind: 'sub-package', dev: true },
  cli: { kind: 'cli', dev: true },
};

export interface KindLimits {
  readonly maxLines: number;
  /**
   * Whether the README must hold a doctest with a `// ->` claim. The cli
   * shows a shell command, and the root's doctests are copies of core's.
   */
  readonly claim: boolean;
  /** The H1 the README opens with: a markdown H1, or the hero's `<h1>`. */
  readonly title: (pkg: Package) => string;
}

export const LIMITS: Readonly<Record<Kind, KindLimits>> = {
  core: {
    maxLines: 200,
    claim: true,
    title: () => '<h1>@nexusdi/core</h1>',
  },
  'sub-package': {
    maxLines: 90,
    claim: true,
    title: (pkg) => `# @nexusdi/${pkg}`,
  },
  cli: { maxLines: 75, claim: false, title: (pkg) => `# @nexusdi/${pkg}` },
  root: { maxLines: 220, claim: false, title: () => '<h1>NexusDI</h1>' },
};

/**
 * The H2 headings each kind must hold, in this order. The README opens with
 * at least one H2 of its own choosing before the first of them (the context
 * and the concept), and may hold more anywhere before the documentation
 * heading. The last two are always the documentation heading and License.
 */
export const HEADINGS: Readonly<Record<Kind, readonly string[]>> = {
  core: [
    'Quick Start',
    'Installation',
    'Ecosystem',
    'Documentation',
    'License',
  ],
  'sub-package': ['Installation', 'Quick Example', 'Documentation', 'License'],
  cli: ['Installation', 'Usage', 'Documentation', 'License'],
  root: [
    'Quick Start',
    'The Ecosystem',
    'Installation',
    'Documentation & Community',
    'License',
  ],
};

/** The logo URL, the one repo URL that stays on `main`. */
export const LOGO =
  'https://raw.githubusercontent.com/NexusDI/core/main/logo.svg';

/** The docs site, by release channel. */
export const DOCS_SITE = {
  next: 'https://nexus.js.org/next/',
  latest: 'https://nexus.js.org/',
} as const;

/** Where the docs site's pages live, relative to the repo root. */
export const DOCS_CONTENT = 'apps/docs/content';
