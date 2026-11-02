/**
 * The NexusDI logo (`logo.svg` at the repository root): a hexagon hub with
 * three lines out to three nodes. The geometry is the file's, point for point.
 * The colours come from `chrome.css`, which keeps the logo's own blues in the
 * light theme and swaps the lines and nodes to the `text` role in the dark
 * theme, where `#2C4B7A` holds 2.0:1 on the bulkhead.
 */
export default function NexusLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="nexus-mark"
      viewBox="0 0 80 80"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g strokeWidth="4" strokeLinecap="round">
        <g className="nexus-mark__line">
          <line x1="40" y1="40" x2="40" y2="12" />
          <line x1="40" y1="40" x2="66" y2="55" />
          <line x1="40" y1="40" x2="14" y2="55" />
        </g>
        <polygon
          className="nexus-mark__hub"
          points="40,28 53,35 53,49 40,56 27,49 27,35"
        />
        <g className="nexus-mark__node">
          <circle cx="40" cy="10" r="6" />
          <circle cx="66" cy="55" r="6" />
          <circle cx="14" cy="55" r="6" />
        </g>
      </g>
    </svg>
  );
}
