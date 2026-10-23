import { Outlet } from 'react-router';
import { Button } from '../components/Button';
import type { Route } from './+types/layout';

export default function Layout(props: Route.ComponentProps) {
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold dark:text-white">Bridge console</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          The Meridian bridge console, on the bridge API over HTTP.
        </p>
      </header>

      <nav className="mb-6 flex justify-center gap-4">
        <Button as="link" to="/" variant="outline">
          Home
        </Button>
        <Button as="link" to="/sectors/Kepler-442b" variant="outline">
          Sectors
        </Button>
        <Button as="link" to="/course/Kepler-442b" variant="outline">
          Course
        </Button>
        <Button as="link" to="/charts" variant="outline">
          Charts
        </Button>
        <Button as="link" to="/diagnostics" variant="outline">
          Diagnostics
        </Button>
        <Button as="link" to="/systems/engineering" variant="outline">
          Engineering
        </Button>
        <Button as="link" to="/systems/life-support" variant="outline">
          Life support
        </Button>
        <Button as="link" to="/systems/safety" variant="outline">
          Safety
        </Button>
        <Button as="link" to="/systems/comms" variant="outline">
          Comms
        </Button>
        <Button as="link" to="/systems/helm" variant="outline">
          Helm
        </Button>
        <Button as="link" to="/systems/ftl" variant="outline">
          FTL
        </Button>
        <Button as="link" to="/airlock" variant="outline">
          Airlock
        </Button>
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
