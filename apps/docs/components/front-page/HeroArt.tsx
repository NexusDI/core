import wide768Avif from './hero/meridian-hero-768.avif';
import wide768Webp from './hero/meridian-hero-768.webp';
import wide1536Avif from './hero/meridian-hero-1536.avif';
import wide1536Webp from './hero/meridian-hero-1536.webp';
import phoneAvif from './hero/meridian-hero-phone-720.avif';
import phoneWebp from './hero/meridian-hero-phone-720.webp';

/**
 * The painted Meridian (site UX spec 4.2). `tools/hero-art.mjs` bakes the
 * files, with the starfield in them, and the page imports them statically so
 * Next hashes each name and adds the base path. Next reads no dimensions from
 * an AVIF file, so each pair's WebP file gives the width and height both
 * share.
 *
 * The wide pair serves 768 and 1536 pixels by width descriptor, and a phone
 * crop serves below 640 pixels. Width and height are the master's, so the
 * hero never shifts the layout; the stylesheet gives the phone crop its own
 * ratio. Nothing on the art moves, so there is no
 * Pause switch.
 */
export default function HeroArt() {
  return (
    <picture
      className="nexus-hero__art"
      style={
        {
          '--nexus-hero-phone-ratio': `${phoneWebp.width} / ${phoneWebp.height}`,
        } as React.CSSProperties
      }
    >
      <source
        media="(max-width: 639px)"
        type="image/avif"
        srcSet={`${phoneAvif.src} ${phoneWebp.width}w`}
        sizes="100vw"
      />
      <source
        media="(max-width: 639px)"
        type="image/webp"
        srcSet={`${phoneWebp.src} ${phoneWebp.width}w`}
        sizes="100vw"
      />
      <source
        type="image/avif"
        srcSet={`${wide768Avif.src} ${wide768Webp.width}w, ${wide1536Avif.src} ${wide1536Webp.width}w`}
        sizes="(min-width: 1440px) 1040px, 72vw"
      />
      <source
        type="image/webp"
        srcSet={`${wide768Webp.src} ${wide768Webp.width}w, ${wide1536Webp.src} ${wide1536Webp.width}w`}
        sizes="(min-width: 1440px) 1040px, 72vw"
      />
      <img
        src={wide1536Webp.src}
        width={wide1536Webp.width}
        height={wide1536Webp.height}
        alt="The Starship Meridian, a survey frigate, in space."
        fetchPriority="high"
        decoding="async"
      />
    </picture>
  );
}
