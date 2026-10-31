import { Chip, Notice } from '@nexusdi/meridian-ui';
import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs';

import ApiFilter from './components/api/ApiFilter';
import BehaviourCatalogue from './components/api/BehaviourCatalogue';
import './components/api/entry.css';
import Diagram from './components/diagram/Diagram';
import Listing from './components/listing/Listing';
import LifetimeMark from './components/chrome/LifetimeMark';
import Output from './components/chrome/Output';
import Prerequisites from './components/chrome/Prerequisites';
import Source from './components/chrome/Source';
import TypeCards from './components/twoslash/TypeCards';
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
    // The four notice labels (spec §5.1). doc-notices holds the budget.
    Notice,
    // Not tags an author writes: `tools/mdx-diagram-loader.mjs` rewrites a
    // mermaid fence into `<Diagram>`, and `tools/mdx-listing-loader.mjs` wraps
    // a fence carrying an exemption tag in `<Listing>`.
    Diagram,
    Listing,
    // `tools/mdx-listing-loader.mjs` wraps a region fence in `<Source>`, and
    // `tools/mdx-nextra-loader.mjs` writes `<Prerequisites>` above a teaching
    // page's first H2. `<Output>` is the terminal an author wraps program
    // output in (site UX spec 13.3).
    Source,
    Prerequisites,
    Output,
    // A lifetime as its word and glyph in the data colour (design system 4.6).
    LifetimeMark,
    // The benchmark figures and tables (docs spec section 4.6). Each reads
    // generated/benchmark-data.json; doc-benchmark-figures holds the paths.
    Figure,
    MeasuredWith,
    PerformanceTable,
    ProbeTable,
    ToolchainGrid,
    // The author writes `<ApiFilter />` at the top of a reference page.
    ApiFilter,
    // `mdx-reference-loader.mjs` writes `<BehaviourCatalogue>` under an entry.
    BehaviourCatalogue,
    // `mdx-reference-loader.mjs` writes `<Chip>` beside an entry's name.
    Chip,
    // `tools/mdx-nextra-loader.mjs` ends every page that has a `twoslash`
    // fence with `<TypeCards />`.
    TypeCards,
  };
}
