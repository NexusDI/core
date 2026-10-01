/**
 * Rewrites every `mermaid` fence into a `<Diagram>` element, so the browser
 * draws the chart and the static HTML carries its caption (docs spec
 * section 12.4).
 *
 *     ```mermaid caption="Tactical imports Engineering."
 *     flowchart TD
 *       Tactical --> Engineering:::accent
 *     ```
 *
 * becomes
 *
 *     <Diagram chart={"flowchart TD\n  Tactical --> …"} caption={"Tactical …"} />
 *
 * Both props are JSON string literals, which MDX reads as JavaScript
 * expressions, so no character in the chart needs escaping for MDX.
 *
 * A fence without a caption throws, so `next build` fails and a diagram with
 * no stated meaning never deploys. The diagram-captions guard reports the same
 * fault with the page path.
 */

const FENCE = /^(\s*)(`{3,})(.*)$/;
const CAPTION = /(?:^|\s)caption="([^"]*)"/;

/**
 * Expands every mermaid fence of an MDX source.
 *
 * `file` names the page in an error message.
 */
export function expandDiagrams(source, file = 'MDX source') {
  const lines = source.split('\n');
  const out = [];

  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(FENCE);
    if (!marker) {
      out.push(lines[index]);
      continue;
    }

    const [, indent, ticks, info] = marker;
    let end = index + 1;
    while (end < lines.length) {
      const close = lines[end].match(FENCE);
      if (close && !close[3].trim() && close[2].length >= ticks.length) break;
      end += 1;
    }

    // An unclosed fence, or any fence that is not a diagram, passes through.
    if (end >= lines.length || info.trim().split(/\s+/)[0] !== 'mermaid') {
      out.push(...lines.slice(index, end + 1));
      index = end;
      continue;
    }

    const caption = info.match(CAPTION)?.[1].trim();
    if (!caption) {
      throw new Error(
        `${file}: the mermaid fence at line ${index + 1} has no caption. Write caption="…" stating what the diagram shows.`,
      );
    }

    const chart = lines
      .slice(index + 1, end)
      .map((body) => body.replace(new RegExp(`^${indent}`), ''))
      .join('\n');
    out.push(
      `${indent}<Diagram chart={${JSON.stringify(chart)}} caption={${JSON.stringify(caption)}} />`,
    );
    index = end;
  }

  return out.join('\n');
}

/** The Turbopack loader: the entry the chain in `loader-chain.mjs` lists. */
export default function mdxDiagramLoader(source) {
  return expandDiagrams(source, this?.resourcePath);
}
