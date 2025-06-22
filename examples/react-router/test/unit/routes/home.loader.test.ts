import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const mockContext = {
  get: vi.fn().mockReturnValue(mockContainer),
};

const mockRequest = new Request('http://localhost:3000/');

// Mock the getContainer function
vi.mock('../../../app/shared/container', () => ({
  getContainer: vi.fn().mockReturnValue(mockContainer),
}));

// Mock the service tokens
vi.mock('../../../app/modules/logger/logger.service', () => ({
  LOGGER_SERVICE_TOKEN: 'LOGGER_SERVICE_TOKEN',
}));

vi.mock('../../../app/modules/users/user.service', () => ({
  USER_SERVICE_TOKEN: 'USER_SERVICE_TOKEN',
}));

describe('Home Route Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock returns
    mockContainer.has.mockImplementation((token) => {
      if (token === 'USER_SERVICE_TOKEN') return true;
      if (token === 'LOGGER_SERVICE_TOKEN') return true;
      return false;
    });

    mockContainer.get.mockImplementation((token) => {
      if (token === 'LOGGER_SERVICE_TOKEN') return mockLoggerService;
      if (token === 'USER_SERVICE_TOKEN') return mockUserService;
      return null;
    });

    mockUserService.getUsers.mockResolvedValue([
      { id: '1', name: 'Alice', email: 'alice@example.com' },
    ]);
  });

  it('should check if services are registered in container', async () => {
    // Import the loader function
    const { loader } = await import('../../../app/routes/home');

    await loader({ context: mockContext, request: mockRequest } as any);

    expect(mockContainer.has).toHaveBeenCalledWith('USER_SERVICE_TOKEN');
    expect(mockContainer.has).toHaveBeenCalledWith('LOGGER_SERVICE_TOKEN');
  });

  it('should log that home page is loaded', async () => {
    const { loader } = await import('../../../app/routes/home');

    await loader({ context: mockContext, request: mockRequest } as any);

    expect(mockLoggerService.info).toHaveBeenCalledWith('Home page loaded');
  });

  it('should return container status and user data', async () => {
    const { loader } = await import('../../../app/routes/home');

    const result = await loader({ context: mockContext, request: mockRequest } as any);

    expect(result).toMatchObject({
      hasUserService: true,
      hasLoggerService: true,
      user: null, // Initial state
    });
  });

  it('should handle missing services gracefully', async () => {
    mockContainer.has.mockReturnValue(false);

    const { loader } = await import('../../../app/routes/home');

    const result = await loader({ context: mockContext, request: mockRequest } as any);

    expect(result).toMatchObject({
      hasUserService: false,
      hasLoggerService: false,
      user: null,
    });
  });
}); 