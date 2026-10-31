import Link from 'next/link';
import { HullCrop } from '@nexusdi/meridian-ui';

import { FRAME, sideBase } from './art';
import Cutaway from './Cutaway';
import { features, placardOf, type SeedModule } from './features';
import modulesJson from './fixtures/modules.json';

const modules = modulesJson as SeedModule[];

const [FX, FY, FW, FH] = FRAME;
/** The `sizes` of the backdrop: the strip's width. */
const BACKDROP = '(min-width: 1440px) 1344px, 100vw';
/**
 * The width a crop's stage takes at 16.4 pixels per metre on a wide screen,
 * and on a phone, where the crop is 120 pixels wide: the whole 80 metre frame.
 */
const STAGE = '(min-width: 640px) 1312px, 880px';
/** A crop frames this many metres: 11 along the hull and 6.4 up, at the side view's scale (tech lead TL19). */
const CROP = [11, 6.4] as const;
/** The top and bottom of the painted hull in the frame, in metres from its top edge. */
const HULL_TOP = 4.2;
const HULL_BOTTOM = 17.2;

/** The crop of a feature, in the cutaway's frame: its anchor a little above the middle. */
function cropOf(
  anchor: readonly [number, number],
): [number, number, number, number] {
  const x = Math.min(Math.max(anchor[0] - CROP[0] / 2, FX), FX + FW - CROP[0]);
  // The hull spans 4.2 to 17.2 metres of the frame's height, so a crop never shows the ground below it.
  const y = Math.min(
    Math.max(17.5 - anchor[1] - CROP[1] * 0.45, HULL_TOP),
    HULL_BOTTOM - CROP[1],
  );
  return [x, y, CROP[0], CROP[1]];
}

/**
 * The ship systems strip (site UX spec 4.8): the painted side of the whole
 * hull, and under it one crop per feature, each a link to the concept page
 * of its feature (tech lead TL9). A leader line runs from the part of the
 * hull where the feature lives to its crop. Each crop is a `HullCrop` around
 * the painted cutaway with the seed lit, at the side view's scale. A placard
 * names the module that holds the feature and its exports, which
 * `scene-fixtures.mjs` reads from `inspect()` of the seed. It opens on hover
 * and focus and sits in the DOM at all times, so a screen reader reads it as
 * the link's description. On a phone the strip is a list and the backdrop is
 * gone.
 */
export default function ShipSystems() {
  const backdrop = sideBase(BACKDROP);
  const column = (at: number) => FX + (FW * (at + 0.5)) / features.length;
  return (
    <div className="nexus-systems">
      <div className="nexus-systems__hull" aria-hidden="true">
        <picture>
          {backdrop.sources?.map((source) => (
            <source
              key={source.type}
              type={source.type}
              srcSet={source.srcSet}
              sizes={backdrop.sizes}
            />
          ))}
          <img
            src={backdrop.src}
            width={backdrop.width}
            height={backdrop.height}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </picture>
        <svg
          className="nexus-systems__leaders"
          viewBox={`${FX} ${FY} ${FW} ${FH}`}
          preserveAspectRatio="none"
        >
          {features.map((feature, at) => {
            const v = 17.5 - feature.anchor[1];
            const bend = 13.2 + at * 0.35;
            return (
              <g key={feature.label}>
                <path
                  className="nexus-systems__leader"
                  d={`M${feature.anchor[0]},${v} V${bend} H${column(at)} V${FY + FH}`}
                />
                <circle
                  className="nexus-systems__dot"
                  cx={feature.anchor[0]}
                  cy={v}
                  r="0.28"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="nexus-systems__list">
        {features.map((feature, at) => (
          <li key={feature.label} className="nexus-systems__item">
            <Link
              href={feature.href}
              className="nexus-systems__link"
              aria-describedby={`nexus-systems-${at}`}
            >
              <HullCrop
                className="nexus-systems__crop"
                full={[FX, FY, FW, FH]}
                crop={cropOf(feature.anchor)}
              >
                <Cutaway sizes={STAGE} scope={`crop-${at}`} />
              </HullCrop>
              <span className="nexus-systems__where">{feature.hull}</span>
              <span className="nexus-systems__name">{feature.label}</span>
              <span className="nexus-systems__line">{feature.line}</span>
            </Link>
            <span
              id={`nexus-systems-${at}`}
              className="nexus-systems__placard"
              role="note"
            >
              {placardOf(feature, modules)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
