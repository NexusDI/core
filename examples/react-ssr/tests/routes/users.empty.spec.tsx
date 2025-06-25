// Example: Minimal route test for Users empty state using NexusDI and React Router v7
// This test demonstrates how to provide a DI container for a single route using createRoutesStub.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, unstable_RouterContext } from 'react-router';
import { Nexus } from '@nexusdi/core';
import Users, { loader as usersLoader } from '../../app/routes/users';
import {
  USER_SERVICE_TOKEN,
  type IUserService,
} from '../../app/modules/users/users.types';
import {
  LOGGER_SERVICE_TOKEN,
  type ILoggerService,
} from '../../app/modules/logger/logger.types';
import { containerContext } from '../../app/shared/container';

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
  let container: Nexus;
  let contextMap: Map<unstable_RouterContext, unknown>;

  beforeEach(() => {
    container = new Nexus();
    contextMap = new Map();
    contextMap.set(containerContext, container);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders 0 users when user list is empty', async () => {
    container.set(USER_SERVICE_TOKEN, { useValue: mockUserService });
    container.set(LOGGER_SERVICE_TOKEN, { useValue: mockLoggerService });
    const Stub = createRoutesStub(
      [
        {
          path: '/users',
          Component: Users,
          loader: usersLoader,
        },
      ],
      () => contextMap
    );
    render(<Stub initialEntries={['/users']} />);
    await waitFor(() => {
      expect(screen.getByText(/User List \(0 users\)/)).toBeDefined();
    });
  });
});
