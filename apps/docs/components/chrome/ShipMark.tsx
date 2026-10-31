/**
 * The ship icon of the Meridian (design system spec 11.4): the silhouette the
 * Ship note glyph draws, at navbar size. It takes the text colour.
 */
export default function ShipMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="nexus-shipmark"
      viewBox="0 0 10 10"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M.8 5 3.2 3.4 4.4 1.4H5.6L6.2 3.4H9.2V6.6H6.2L5.6 8.6H4.4L3.2 6.6Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
