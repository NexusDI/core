// Example: Minimal route test for Users empty state using NexusDI and React Router v7
// This test demonstrates how to provide a DI container for a single route using createRoutesStub.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import Users, { loader as usersLoader } from '../../app/routes/users';
import { type IUserService } from '../../app/modules/users/users.types';
import { type ILoggerService } from '../../app/modules/logger/logger.types';
import { routeContext } from '../support/route-context';

const mockUserService: IUserService = {
  getUsers: vi.fn().mockResolvedValue([]),
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

describe('Users route empty state (framework mode, minimal DI example)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders 0 users when user list is empty', async () => {
    const contextMap = await routeContext({
      logger: mockLoggerService,
      users: mockUserService,
    });
    const Stub = createRoutesStub(
      [
        {
          path: '/users',
          Component: Users,
          loader: usersLoader,
        },
      ],
      new RouterContextProvider(contextMap),
    );
    render(<Stub initialEntries={['/users']} />);
    await waitFor(() => {
      expect(screen.getByText(/User List \(0 users\)/)).toBeDefined();
    });
  });
});
