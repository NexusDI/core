import { mapFences } from './fences.mjs';

/**
 * Wraps every code fence that carries an exemption tag in `<Listing>`, so the
 * reader sees that nothing ran it (docs spec section 12.3).
 *
 *     ```ts no-run
 *     ship.get(NAV_CHARTS);
 *     ```
 *
 * becomes
 *
 *     <Listing mark="no-run">
 *
 *     ```ts no-run
 *     ship.get(NAV_CHARTS);
 *     ```
 *
 *     </Listing>
 *
 * The blank lines keep MDX parsing the fence as Markdown inside the JSX
 * element. The fence keeps its info string, so Shiki and the doc-fence guard
 * read what the author wrote. A fence without a tag, such as a region
 * reference, a Twoslash block or a shell block, passes through unchanged.
 *
 * Only the tag words of the info string count. A tag that appears in the
 * code does nothing.
 */

/** The five exemption tags of documentation standard section 5. */
const TAGS = [
  'signature',
  'no-run',
  'anti-example',
  'fails-type-check',
  'elided',
];

/** The first exemption tag among the words of a fence's info string. */
function tagOf(info) {
  return info.split(/\s+/).find((word) => TAGS.includes(word));
}

/** Wraps every tagged fence of an MDX source in `<Listing mark="…">`. */
export function markListings(source) {
  return mapFences(source, ({ indent, info, opener, body, closer }) => {
    const mark = tagOf(info);
    const fence = [opener, ...body, closer];
    return mark
      ? [
          `${indent}<Listing mark="${mark}">`,
          '',
          ...fence,
          '',
          `${indent}</Listing>`,
        ]
      : fence;
  });
}

/** The Turbopack loader: the entry the chain in `loader-chain.mjs` lists. */
export default function mdxListingLoader(source) {
  return markListings(source);
}
