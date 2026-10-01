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

const FENCE = /^(\s*)(`{3,})(.*)$/;

/** The first exemption tag among the words of a fence's info string. */
function tagOf(info) {
  return info.split(/\s+/).find((word) => TAGS.includes(word));
}

/**
 * Wraps every tagged fence of an MDX source in `<Listing mark="…">`.
 *
 * A fence opened with N backticks closes on a line of at least N backticks
 * and nothing else, so a shorter fence inside a longer one is body text.
 */
export function markListings(source) {
  const out = [];
  let open = null;

  for (const line of source.split('\n')) {
    const marker = line.match(FENCE);

    if (open === null) {
      if (!marker) {
        out.push(line);
        continue;
      }
      const [, indent, ticks, info] = marker;
      open = { indent, ticks, mark: tagOf(info), start: out.length };
      out.push(line);
      continue;
    }

    out.push(line);
    const closes =
      marker && !marker[3].trim() && marker[2].length >= open.ticks.length;
    if (!closes) continue;

    if (open.mark) {
      out.splice(
        open.start,
        0,
        `${open.indent}<Listing mark="${open.mark}">`,
        '',
      );
      out.push('', `${open.indent}</Listing>`);
    }
    open = null;
  }

  return out.join('\n');
}

/** The Turbopack loader: the entry the chain in `loader-chain.mjs` lists. */
export default function mdxListingLoader(source) {
  return markListings(source);
}
