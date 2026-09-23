import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs';

const themeComponents = getThemeComponents();

/**
 * The component map every MDX page compiles against. Nextra resolves this
 * file by convention at the app root. Later tasks add the site's own
 * components after `components`, so a caller cannot shadow them.
 */
export function useMDXComponents(components) {
  return {
    ...themeComponents,
    ...components,
  };
}
