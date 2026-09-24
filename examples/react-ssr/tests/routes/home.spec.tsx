// Example: Minimal route test for Home using NexusDI and React Router v7
// This test demonstrates how to provide a DI container for a single route using createRoutesStub.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import Home, { loader as homeLoader } from '../../app/routes/home';
import { type IUserService } from '../../app/modules/users/users.types';
import { type ILoggerService } from '../../app/modules/logger/logger.types';
import { routeContext } from '../support/route-context';

// Mocks
const mockUserService: IUserService = {
  getUsers: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
};
const mockLoggerService: ILoggerService = {
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('Home route (framework mode, minimal DI example)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the home page with both providers registered', async () => {
    const contextMap = await routeContext({
      logger: mockLoggerService,
      users: mockUserService,
    });

    const Stub = createRoutesStub(
      [
        {
          path: '/',
          Component: Home,
          loader: homeLoader,
        },
      ],
      new RouterContextProvider(contextMap),
    );
    render(<Stub initialEntries={['/']} />);
    await waitFor(() => {
      expect(screen.getAllByText('Registered')).toHaveLength(2);
      expect(screen.getByText(/Container Status/i)).toBeDefined();
    });
  });

  it('renders the home page with only one provider registered', async () => {
    const contextMap = await routeContext({ logger: mockLoggerService });

    const Stub = createRoutesStub(
      [
        {
          path: '/',
          Component: Home,
          loader: homeLoader,
        },
      ],
      new RouterContextProvider(contextMap),
    );
    render(<Stub initialEntries={['/']} />);
    await waitFor(() => {
      expect(screen.getByText('Registered')).toBeDefined();
      expect(screen.getByText('Not Registered')).toBeDefined();
      expect(screen.getByText(/Container Status/i)).toBeDefined();
    });
  });
});
