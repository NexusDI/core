import { Diagnostics } from './diagnostics';
import { Link, usePath } from './router';
import { Charts } from './routes/charts';
import { CommandRoute } from './routes/command';
import { Home } from './routes/home';
import { withDevtools } from './ship/ship';

function Route({ path }: { path: string }) {
  switch (path) {
    case '/charts':
      return <Charts />;
    case '/command':
      return <CommandRoute />;
    case '/diagnostics':
      return withDevtools ? (
        <Diagnostics />
      ) : (
        <p>This build has no devtools.</p>
      );
    default:
      return <Home />;
  }
}

/** The shell's layout: the ship's name, the station links and the route. */
export function App() {
  const path = usePath();
  return (
    <main>
      <h1>Meridian</h1>
      <nav>
        <Link to="/">Bridge</Link> <Link to="/charts">Cartography</Link>{' '}
        <Link to="/command">Command</Link>
        {withDevtools ? (
          <>
            {' '}
            <Link to="/diagnostics">Diagnostics</Link>
          </>
        ) : null}
      </nav>
      <Route path={path} />
    </main>
  );
}
