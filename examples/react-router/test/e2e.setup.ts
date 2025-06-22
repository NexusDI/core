import '@testing-library/jest-dom';
import 'reflect-metadata';
import { beforeAll, afterEach, afterAll, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeEach(() => {
  console.log = vi.fn();
  console.info = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
});

afterEach(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

// MSW Server setup for API mocking
export const server = setupServer(
  // Mock users API
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
      { id: '3', name: 'Charlie', email: 'charlie@example.com' },
    ]);
  }),

  // Mock user creation
  http.post('/api/users', async ({ request }: { request: Request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: '4',
      ...body,
    });
  }),

  // Mock logging endpoint
  http.post('/api/logs', () => {
    return HttpResponse.json({ success: true });
  }),
);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close()); 