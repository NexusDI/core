/**
 * The fences of an MDX source, for a loader that rewrites some of them.
 *
 * A fence line is up to three spaces of indent, then three or more backticks
 * or tildes. CommonMark gives a backtick fence no backtick in its info
 * string, so a one-line triple-backtick span is no opener.
 */
const FENCE = /^( {0,3})(`{3,}(?!.*`)|~{3,})(.*)$/;

/**
 * The source with every closed fence replaced by what `rewrite` returns for
 * it. `rewrite` gets the fence's indent, its backticks or tildes, its info
 * string, its body and its opening and closing lines, and returns the lines
 * to put in its place. Every line outside a fence, and an unclosed fence,
 * passes through.
 *
 * A fence opened with N backticks or tildes closes on a line of at least N of
 * the same character and nothing else, so a shorter fence, or a fence of the
 * other character, inside it is body text. `fence` is the pattern a line
 * opens or closes a fence by, with the indent, the marker and the info string
 * as its three groups.
 */
export function mapFences(source, rewrite, fence = FENCE) {
  const out = [];
  let open = null;

  for (const line of source.split('\n')) {
    const marker = line.match(fence);

    if (open === null) {
      if (marker) {
        const [, indent, ticks, info] = marker;
        open = { indent, ticks, info, opener: line, body: [] };
      } else out.push(line);
      continue;
    }

    const closes =
      marker &&
      !marker[3].trim() &&
      marker[2][0] === open.ticks[0] &&
      marker[2].length >= open.ticks.length;
    if (!closes) {
      open.body.push(line);
      continue;
    }

    out.push(...rewrite({ ...open, closer: line }));
    open = null;
  }

  // An unclosed fence reaches the end of the page; MDX reports it.
  if (open !== null) out.push(open.opener, ...open.body);

  return out.join('\n');
}
