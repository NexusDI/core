import type { ReactNode } from 'react';

import './listing.css';

/** The reader-facing label for each exemption tag. */
const LABELS: Record<string, string> = {
  signature: 'Signature',
  'no-run': 'Not run',
  'anti-example': 'Anti-example',
  'fails-type-check': 'Fails the type check',
  elided: 'Elided',
};

interface ListingProps {
  /** The exemption tag the fence carries. */
  mark: string;
  children: ReactNode;
}

/**
 * A code fence that nothing executed, labelled so the reader knows.
 *
 * `tools/mdx-listing-loader.mjs` wraps every fence with an exemption tag in
 * this element.
 */
export default function Listing({ mark, children }: Readonly<ListingProps>) {
  return (
    <div className="nexus-listing" data-mark={mark}>
      <p className="nexus-listing__label">{LABELS[mark] ?? mark}</p>
      {children}
    </div>
  );
}
