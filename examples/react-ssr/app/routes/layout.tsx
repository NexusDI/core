import { Outlet } from 'react-router';
import { Button } from '../components/Button';
import type { Route } from './+types/layout';

export default function Layout(props: Route.ComponentProps) {
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold dark:text-white">NexusDI Showcase</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          A demonstration of dependency injection in a React Router application.
        </p>
      </header>

      <nav className="mb-6 flex justify-center gap-4">
        <Button as="link" to="/" variant="outline">
          Home
        </Button>
        <Button as="link" to="/users" variant="outline">
          Users
        </Button>
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
