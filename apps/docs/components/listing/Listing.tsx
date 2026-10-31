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
 * A code fence that nothing executed, labelled so the reader knows. The label
is a placard with the Note glyph (site UX spec 13.3).
 *
 * `tools/mdx-listing-loader.mjs` wraps every fence with an exemption tag in
 * this element.
 */
export default function Listing({ mark, children }: Readonly<ListingProps>) {
  return (
    <div className="nexus-listing" data-mark={mark}>
      <p className="nexus-listing__label">
        <svg
          viewBox="0 0 10 10"
          width="10"
          height="10"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
        >
          <circle cx="5" cy="5" r="3.9" />
          <path d="M5 4.4v2.6M5 2.9v.1" />
        </svg>
        {LABELS[mark] ?? mark}
      </p>
      {children}
    </div>
  );
}
