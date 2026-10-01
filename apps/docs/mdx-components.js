import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs';

import { PostList } from './components/blog/PostList';
import {
  Figure,
  MeasuredWith,
  PerformanceTable,
  ProbeTable,
  ToolchainGrid,
} from './components/benchmarks';

const themeComponents = getThemeComponents();

/**
 * The component map every MDX page compiles against. Nextra resolves this
 * file by convention at the app root. The site's own components come after
 * `components`, so a caller cannot shadow them.
 */
export function useMDXComponents(components) {
  return {
    ...themeComponents,
    ...components,
    PostList,
    // The benchmark figures and tables (docs spec section 4.6). Each reads
    // generated/benchmark-data.json; doc-benchmark-figures holds the paths.
    Figure,
    MeasuredWith,
    PerformanceTable,
    ProbeTable,
    ToolchainGrid,
  };
}
