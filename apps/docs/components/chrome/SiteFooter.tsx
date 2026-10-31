import Link from 'next/link';

import { NPM, REPOSITORY } from '../../app/links';
import { shipSystems } from '../../app/ship-systems';

/**
 * The footer (site UX spec 13.1): the ship systems list, the license line and
 * the links to GitHub and npm. The "Pause background" switch of docs-site
 * 16.1 waits for a background module, which no page has yet. The front page
 * and the feature pages mount this same component.
 */
export default function SiteFooter({ year }: { year: number }) {
  return (
    <footer className="nexus-footer">
      <nav className="nexus-footer__systems" aria-label="Ship systems">
        <p className="nexus-footer__placard">Ship systems</p>
        <ul>
          {shipSystems.map((system) => (
            <li key={system.href}>
              <Link href={system.href}>{system.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="nexus-footer__legal">
        <p>MIT license. © {year} NexusDI.</p>
        <ul>
          <li>
            <a href={REPOSITORY}>GitHub</a>
          </li>
          <li>
            <a href={NPM}>npm</a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
