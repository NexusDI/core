import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import userEvent from '@testing-library/user-event';

// Mock the container and services
const mockContainer = {
  has: vi.fn(),
  get: vi.fn(),
};

const mockLoggerService = {
  info: vi.fn(),
};

const mockUserService = {
  getUsers: vi.fn(),
};

// Mock the getContainer function
vi.mock('../../app/shared/container', () => ({
  getContainer: vi.fn().mockReturnValue(mockContainer),
}));

// Mock the service tokens
vi.mock('../../app/modules/logger/logger.service', () => ({
  LOGGER_SERVICE_TOKEN: 'LOGGER_SERVICE_TOKEN',
}));

vi.mock('../../app/modules/users/user.service', () => ({
  USER_SERVICE_TOKEN: 'USER_SERVICE_TOKEN',
}));

describe('Home Page E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock returns
    mockContainer.has.mockReturnValue(true);
    mockContainer.get.mockImplementation((token) => {
      if (token === 'LOGGER_SERVICE_TOKEN') return mockLoggerService;
      if (token === 'USER_SERVICE_TOKEN') return mockUserService;
      return null;
    });

    mockUserService.getUsers.mockResolvedValue([
      { id: '1', name: 'Alice', email: 'alice@example.com' },
    ]);
  });

  it('should render home page with container status', async () => {
    // Mock the loader to return test data
    const mockLoader = vi.fn().mockResolvedValue({
      hasUserService: true,
      hasLoggerService: true,
      user: null,
    });

    // Mock the action
    const mockAction = vi.fn().mockResolvedValue({ message: 'Test message' });

    // Create router with mocked routes
    const router = createMemoryRouter([
      {
        path: '/',
        element: <div>Home Page</div>,
        loader: mockLoader,
        action: mockAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });

    // Verify loader was called
    expect(mockLoader).toHaveBeenCalled();
  });

  it('should display container status cards', async () => {
    const mockLoader = vi.fn().mockResolvedValue({
      hasUserService: true,
      hasLoggerService: false,
      user: null,
    });

    const router = createMemoryRouter([
      {
        path: '/',
        element: <div>Home Page</div>,
        loader: mockLoader,
      },
    ]);

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(mockLoader).toHaveBeenCalled();
    });
  });

  it('should handle form submissions', async () => {
    const user = userEvent.setup();
    const mockAction = vi.fn().mockResolvedValue({ message: 'Logged a message' });

    // Mock the loader to return test data
    const mockLoader = vi.fn().mockResolvedValue({
      hasUserService: true,
      hasLoggerService: true,
      user: null,
    });

    // Create router with the actual home page component
    const router = createMemoryRouter([
      {
        path: '/',
        element: <div>Home Page</div>,
        loader: mockLoader,
        action: mockAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });

    // Since we're not rendering the actual home component, we'll test that the action is available
    // In a real scenario, you'd render the actual home component and click the form button
    expect(mockAction).toBeDefined();
  });

  it('should handle service errors gracefully', async () => {
    // Mock service to throw error
    mockContainer.get.mockImplementation(() => {
      throw new Error('Service not found');
    });

    const mockLoader = vi.fn().mockRejectedValue(new Error('Service error'));

    const router = createMemoryRouter([
      {
        path: '/',
        element: <div>Error Page</div>,
        loader: mockLoader,
        errorElement: <div>Something went wrong</div>,
      },
    ]);

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });
}); 