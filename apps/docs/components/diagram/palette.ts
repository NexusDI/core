/**
 * The colours Mermaid draws with, as sentinels. Mermaid computes shades from
 * the colours it is given and writes them into the SVG as literals, so a
 * property cannot go in directly. The chart is rendered with six sentinel
 * hex values, and `recolour` swaps each one in the SVG for a `--meridian-*`
 * property. `global.css` binds the properties per theme, so the theme switch
 * recolours a drawn diagram by rebinding the property and nothing re-renders.
 *
 * The sentinels are far from any colour a page author would write, and
 * `diagram.test.ts` fails a chart that writes a hex colour of its own.
 */
export const sentinel = {
  page: '#010a0b',
  surface: '#020b0c',
  rule: '#030c0d',
  text: '#040d0e',
  muted: '#050e0f',
  hue: '#060f10',
} as const;

/**
 * What each sentinel becomes: a `--meridian-*` property that `global.css`
 * binds per theme, so the theme switch recolours a diagram by rebinding the
 * property and nothing re-renders.
 */
export const property: Record<keyof typeof sentinel, string> = {
  page: 'var(--meridian-ground-0)',
  surface: 'var(--meridian-hull)',
  rule: 'var(--meridian-rule)',
  text: 'var(--meridian-text)',
  muted: 'var(--meridian-text-secondary)',
  hue: 'var(--meridian-signal-cyan)',
};

/** A rem length as the pixel string Mermaid reads, at the 16px root size. */
function px(rem: string): string {
  return `${Number.parseFloat(rem) * 16}px`;
}

/**
 * The Mermaid `base` theme with every colour pinned to a sentinel, so no
 * shade is derived from a colour the palette did not name.
 */
export const themeVariables = {
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: px('0.875rem'),
  background: sentinel.page,
  primaryColor: sentinel.surface,
  primaryBorderColor: sentinel.rule,
  primaryTextColor: sentinel.text,
  secondaryColor: sentinel.surface,
  secondaryBorderColor: sentinel.rule,
  secondaryTextColor: sentinel.text,
  tertiaryColor: sentinel.surface,
  tertiaryBorderColor: sentinel.rule,
  tertiaryTextColor: sentinel.text,
  lineColor: sentinel.muted,
  textColor: sentinel.text,
  mainBkg: sentinel.surface,
  nodeBorder: sentinel.rule,
  nodeTextColor: sentinel.text,
  clusterBkg: sentinel.page,
  clusterBorder: sentinel.rule,
  edgeLabelBackground: sentinel.page,
  titleColor: sentinel.text,
};

/**
 * The class that `:::accent` selects: the one node a chart highlights, drawn
 * with the hue on a surface fill.
 */
export const accentClass = `classDef accent fill:${sentinel.surface},stroke:${sentinel.hue},stroke-width:2px,color:${sentinel.text}`;

/** The `rgb(r, g, b)` spelling of a `#rrggbb` colour, as Mermaid may write it. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

/** Replaces every sentinel colour in a rendered SVG with its property. */
export function recolour(svg: string): string {
  let out = svg;
  for (const [role, hex] of Object.entries(sentinel)) {
    const value = property[role as keyof typeof sentinel];
    out = out.replaceAll(new RegExp(hex, 'gi'), value);
    out = out.replaceAll(rgb(hex), value);
  }
  return out;
}
