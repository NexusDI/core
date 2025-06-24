import { Outlet } from 'react-router';
import { Button } from '../components/Button';

export default function Layout() {
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      {/* Header */}
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold dark:text-white">NexusDI Showcase</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          A demonstration of dependency injection in a React Router application.
        </p>
      </header>

      {/* Navigation */}
      <nav className="mb-6 flex justify-center gap-4">
        <Button as="link" to="/" variant="outline">
          Home
        </Button>
        <Button as="link" to="/users" variant="outline">
          Users
        </Button>
      </nav>

      {/* Content - Child routes will render here */}
      <main>
        <Outlet />
      </main>
    </div>
  );
} 