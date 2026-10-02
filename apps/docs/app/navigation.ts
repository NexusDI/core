/**
 * The site's structure as data: the page kinds of spec §4.2, the pages the
 * floor guard requires, the named concept list and the sidebar bands.
 *
 * `tools/repo-checks` imports this module to hold `content/` against it, so it
 * imports nothing from React or Next.
 */

export const pageKinds = [
  'overview',
  'tutorial',
  'concept',
  'question',
  'platform',
  'contract',
  'reference',
  'code',
  'blog',
  'post',
] as const;

export type PageKind = (typeof pageKinds)[number];

/** The kinds that sit on the teaching path and carry a `requires` box. */
export const teachingKinds: readonly PageKind[] = ['tutorial', 'concept'];

/** G2: these pages exist with these kinds. */
export const floorPages = {
  index: 'overview',
  'getting-started': 'tutorial',
  'api-errors': 'reference',
  api: 'reference',
} as const satisfies Record<string, PageKind>;

/** G2: the Concepts band, in teaching order (spec §4.3, pages 3 to 13). */
export const conceptPages = [
  'tokens',
  'providers',
  'lifetimes',
  'modules',
  'configurable-modules',
  'scopes',
  'lifecycle',
  'lazy',
  'multi-providers',
  'errors',
  'introspection',
] as const;

/** The sidebar separators in `content/_meta.ts`, in order. */
export const bands = [
  'Start',
  'Concepts',
  'Guides',
  'Migration',
  'API',
] as const;

/**
 * Routes under `app/(tool)`. G7 accepts a link to any of them. Phase 2 adds
 * `/playground/`, phase 4 the Academy routes.
 */
export const toolRoutes: readonly string[] = [];
