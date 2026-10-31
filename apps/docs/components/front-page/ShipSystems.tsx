import Link from 'next/link';

import { features, placardOf, type SeedModule } from './features';
import modulesJson from './fixtures/modules.json';

const modules = modulesJson as SeedModule[];

/**
 * The ship systems strip (site UX spec 4.8): one crop per feature, each a
 * link to the concept page of its feature (tech lead TL9). A placard names
 * the module that holds the feature and its exports, which
 * `scene-fixtures.mjs` reads from `inspect()` of the seed. It opens on hover
 * and focus and sits in the DOM at all times, so a screen reader reads it as
 * the link's description. The strip is a list on a phone.
 *
 * The painted hull crops arrive with the ship art (owner ruling OR4); until
 * then each entry shows the hull part and no picture.
 */
export default function ShipSystems() {
  return (
    <ul className="nexus-systems">
      {features.map((feature, at) => (
        <li key={feature.label} className="nexus-systems__item">
          <Link
            href={feature.href}
            className="nexus-systems__link"
            aria-describedby={`nexus-systems-${at}`}
          >
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
  );
}
