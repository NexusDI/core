import { Diagnostics } from './diagnostics';
import { Nav } from './nav';
import { Home } from './routes/home';
import { usePath } from './router';
import { withDevtools } from './ship/ship';
import { StationRoute } from './station-route';
import { stationAt } from './stations';

function Route({ path }: { path: string }) {
  const station = stationAt(path);
  if (station !== undefined) return <StationRoute station={station} />;
  if (path === '/diagnostics')
    return withDevtools ? <Diagnostics /> : <p>This build has no devtools.</p>;
  return <Home />;
}

/** The shell's layout: the station links above the current route. */
export function App() {
  const path = usePath();
  return (
    <main>
      <h1>Meridian</h1>
      <Nav diagnostics={withDevtools} />
      <Route path={path} />
    </main>
  );
}
