import { Navbar, ThemeSwitch } from 'nextra-theme-docs';

import { REPOSITORY } from '../../app/links';
import DocsCurrent from './DocsCurrent';
import ShipMark from './ShipMark';

/**
 * The navbar on the bulkhead (site UX spec 13.1). The home link is the ship
 * icon and the name in the display face. Nextra renders the page-type entries
 * of `content/_meta.ts` (Docs; Academy, Playground and Blog join in the phase
 * that builds each), then the search the layout passes, the GitHub link and
 * this theme switch. `DocsCurrent` marks the Docs entry current on every
 * content page. There is no Features entry (Q8). The front page and the
 * feature pages mount this same component.
 */
export default function SiteNavbar() {
  return (
    <Navbar
      logo={
        <span className="nexus-logo">
          <ShipMark />
          <span className="nexus-logo__name">NexusDI</span>
        </span>
      }
      projectLink={REPOSITORY}
    >
      <DocsCurrent />
      <ThemeSwitch lite />
    </Navbar>
  );
}
