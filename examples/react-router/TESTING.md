# Testing Guide for React Router 7 + NexusDI Example

This guide demonstrates how to write comprehensive tests for a React Router 7 application using NexusDI, including unit tests, integration tests, and e2e tests with mocked dependencies.

## 🧪 Testing Setup

### Dependencies

```bash
npm install --save-dev vitest @vitest/ui @vitest/coverage-v8
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install --save-dev jsdom msw
```

### Configuration

**vitest.config.ts** - Unit tests
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    css: true,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
    },
  },
});
```

**vitest.e2e.config.ts** - E2E tests
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/e2e.setup.ts'],
    globals: true,
    css: true,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
    },
  },
});
```

## 🧩 Unit Testing DI Services

### Testing Service Classes

```typescript
// test/unit/modules/users/user.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Nexus } from '../../../../src';
import { UserService, USER_SERVICE_TOKEN } from '../../../app/modules/users/user.service';

describe('UserService', () => {
  let container: Nexus;
  let userService: UserService;

  beforeEach(() => {
    container = new Nexus();
    container.register(USER_SERVICE_TOKEN, UserService);
    userService = container.get(USER_SERVICE_TOKEN);
  });

  describe('getUsers', () => {
    it('should return a list of users', async () => {
      const users = await userService.getUsers();
      
      expect(users).toBeInstanceOf(Array);
      expect(users.length).toBeGreaterThan(0);
      
      const firstUser = users[0];
      expect(firstUser).toHaveProperty('id');
      expect(firstUser).toHaveProperty('name');
      expect(firstUser).toHaveProperty('email');
    });
  });
});
```

### Testing with Mocked Dependencies

```typescript
// test/unit/modules/logger/logger.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the container and services
const mockContainer = {
  has: vi.fn(),
  get: vi.fn(),
};

const mockLoggerService = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('LoggerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log info messages', () => {
    const message = 'Test info message';
    const data = { userId: 123 };

    mockLoggerService.info(message, data);

    expect(mockLoggerService.info).toHaveBeenCalledWith(message, data);
    expect(mockLoggerService.info).toHaveBeenCalledTimes(1);
  });
});
```

## 🛣️ Testing Route Loaders and Actions

### Testing Loaders with Mocked Container

```typescript
// test/unit/routes/home.loader.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the container and services
const mockContainer = {
  has: vi.fn(),
  get: vi.fn(),
};

const mockLoggerService = {
  info: vi.fn(),
};

const mockContext = {
  get: vi.fn().mockReturnValue(mockContainer),
};

// Mock the getContainer function
vi.mock('../../../app/shared/container', () => ({
  getContainer: vi.fn().mockReturnValue(mockContainer),
}));

describe('Home Route Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockContainer.has.mockReturnValue(true);
    mockContainer.get.mockReturnValue(mockLoggerService);
  });

  it('should check if services are registered', async () => {
    const { loader } = await import('../../../app/routes/home');

    await loader({ context: mockContext, request: new Request('http://localhost:3000/') } as any);

    expect(mockContainer.has).toHaveBeenCalledWith('USER_SERVICE_TOKEN');
    expect(mockContainer.has).toHaveBeenCalledWith('LOGGER_SERVICE_TOKEN');
  });

  it('should log that home page is loaded', async () => {
    const { loader } = await import('../../../app/routes/home');

    await loader({ context: mockContext, request: new Request('http://localhost:3000/') } as any);

    expect(mockLoggerService.info).toHaveBeenCalledWith('Home page loaded');
  });
});
```

### Testing Actions with Form Data

```typescript
// test/unit/routes/home.action.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Home Route Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle log message intent', async () => {
    const { action } = await import('../../../app/routes/home');
    
    const formData = new FormData();
    formData.append('intent', 'logMessage');
    
    const request = new Request('http://localhost:3000/', {
      method: 'POST',
      body: formData,
    });

    const result = await action({ request, context: mockContext } as any);

    expect(result).toEqual({ message: 'Logged a message to the console.' });
  });
});
```

## 🧪 Component Testing

### Testing React Components

```typescript
// test/unit/components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../../app/components/Button';

describe('Button Component', () => {
  it('should render button with default variant', () => {
    render(<Button>Click me</Button>);
    
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-blue-500');
  });

  it('should render as link when as="link" is specified', () => {
    render(
      <Button as="link" to="/test">
        Link Button
      </Button>
    );
    
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test');
  });
});
```

## 🌐 E2E Testing with MSW

### Setting up MSW

```typescript
// test/e2e.setup.ts
import { beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// MSW Server setup for API mocking
export const server = setupServer(
  // Mock users API
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
    ]);
  }),

  // Mock user creation
  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: '3',
      ...body,
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### E2E Tests with Mocked Dependencies

```typescript
// test/e2e/home.e2e.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// Mock the getContainer function
vi.mock('../../app/shared/container', () => ({
  getContainer: vi.fn().mockReturnValue(mockContainer),
}));

describe('Home Page E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContainer.has.mockReturnValue(true);
    mockContainer.get.mockReturnValue(mockLoggerService);
  });

  it('should render home page with container status', async () => {
    const mockLoader = vi.fn().mockResolvedValue({
      hasUserService: true,
      hasLoggerService: true,
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
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });

    expect(mockLoader).toHaveBeenCalled();
  });

  it('should handle form submissions', async () => {
    const user = userEvent.setup();
    const mockAction = vi.fn().mockResolvedValue({ message: 'Logged a message' });

    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <form method="post">
            <input type="hidden" name="intent" value="logMessage" />
            <button type="submit">Log Message</button>
          </form>
        ),
        action: mockAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    const submitButton = screen.getByRole('button', { name: /log message/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalled();
    });
  });
});
```

## 🎯 Testing Best Practices

### 1. Mock Dependencies at the Right Level

- **Unit tests**: Mock external dependencies (APIs, databases)
- **Integration tests**: Use real DI container with mocked services
- **E2E tests**: Mock at the API level with MSW

### 2. Test Service Interfaces

```typescript
// Test the interface, not the implementation
const mockUserService: IUserService = {
  getUsers: vi.fn().mockResolvedValue([]),
};
```

### 3. Use Type-Safe Mocks

```typescript
// Create typed mocks
const mockContainer: Nexus = {
  get: vi.fn(),
  has: vi.fn(),
  register: vi.fn(),
} as any;
```

### 4. Test Error Scenarios

```typescript
it('should handle service errors gracefully', async () => {
  mockContainer.get.mockImplementation(() => {
    throw new Error('Service not found');
  });

  const result = await loader({ context: mockContext, request: mockRequest } as any);
  
  expect(result).toMatchObject({
    hasUserService: false,
    hasLoggerService: false,
  });
});
```

### 5. Test Middleware Integration

```typescript
it('should provide container in context', async () => {
  const { containerMiddleware } = await import('../../../app/shared/container');
  
  const mockContext = { set: vi.fn() };
  const mockNext = vi.fn().mockResolvedValue(new Response());
  
  await containerMiddleware({ context: mockContext }, mockNext);
  
  expect(mockContext.set).toHaveBeenCalledWith(expect.any(Symbol), expect.any(Object));
});
```

## 📊 Test Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "vitest --config vitest.e2e.config.ts"
  }
}
```

## 🔧 Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run e2e tests
npm run test:e2e
```

This testing approach ensures comprehensive coverage of your DI code, route handlers, and user interactions while maintaining type safety and following React Router 7 best practices. 