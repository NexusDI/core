// Example: Minimal route test for Home using NexusDI and React Router v7
// This test demonstrates how to provide a DI container for a single route using createRoutesStub.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, unstable_RouterContext } from 'react-router';
import { Nexus } from '@nexusdi/core';
import Home, { loader as homeLoader } from '../../app/routes/home';
import {
  USER_SERVICE_TOKEN,
  type IUserService,
} from '../../app/modules/users/users.types';
import {
  LOGGER_SERVICE_TOKEN,
  type ILoggerService,
} from '../../app/modules/logger/logger.types';
import { containerContext } from '../../app/shared/container';

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

  it('renders the home page with both providers registered', async () => {
    container.set(USER_SERVICE_TOKEN, { useValue: mockUserService });
    container.set(LOGGER_SERVICE_TOKEN, { useValue: mockLoggerService });

    const Stub = createRoutesStub(
      [
        {
          path: '/',
          Component: Home,
          loader: homeLoader,
        },
      ],
      () => contextMap
    );
    render(<Stub initialEntries={['/']} />);
    await waitFor(() => {
      expect(screen.getAllByText('Registered')).toHaveLength(2);
      expect(screen.getByText(/Container Status/i)).toBeDefined();
    });
  });

  it('renders the home page with only one provider registered', async () => {
    container.set(LOGGER_SERVICE_TOKEN, { useValue: mockLoggerService });
    // USER_SERVICE_TOKEN is not set

    const Stub = createRoutesStub(
      [
        {
          path: '/',
          Component: Home,
          loader: homeLoader,
        },
      ],
      () => contextMap
    );
    render(<Stub initialEntries={['/']} />);
    await waitFor(() => {
      expect(screen.getByText('Registered')).toBeDefined();
      expect(screen.getByText('Not Registered')).toBeDefined();
      expect(screen.getByText(/Container Status/i)).toBeDefined();
    });
  });
});
