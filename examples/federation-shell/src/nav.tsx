import { Link } from './router';
import { STATIONS } from './stations';

/** The station links, in table order, after the bridge and before diagnostics. */
export function Nav({ diagnostics }: { diagnostics: boolean }) {
  const links = [
    { path: '/', label: 'Bridge' },
    ...STATIONS,
    ...(diagnostics ? [{ path: '/diagnostics', label: 'Diagnostics' }] : []),
  ];
  return (
    <nav>
      <ul>
        {links.map(({ path, label }) => (
          <li key={path}>
            <Link to={path}>{label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
