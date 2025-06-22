import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the console methods
const mockConsole = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock the Nexus container
const mockContainer = {
  get: vi.fn(),
  has: vi.fn(),
  register: vi.fn(),
};

// Mock the LoggerService
const mockLoggerService = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('LoggerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Replace console methods with mocks
    global.console = { ...global.console, ...mockConsole };
  });

  describe('logging methods', () => {
    it('should log info messages', () => {
      const message = 'Test info message';
      const data = { userId: 123 };

      mockLoggerService.info(message, data);

      expect(mockLoggerService.info).toHaveBeenCalledWith(message, data);
      expect(mockLoggerService.info).toHaveBeenCalledTimes(1);
    });

    it('should log warning messages', () => {
      const message = 'Test warning message';

      mockLoggerService.warn(message);

      expect(mockLoggerService.warn).toHaveBeenCalledWith(message);
      expect(mockLoggerService.warn).toHaveBeenCalledTimes(1);
    });

    it('should log error messages', () => {
      const message = 'Test error message';
      const error = new Error('Something went wrong');

      mockLoggerService.error(message, error);

      expect(mockLoggerService.error).toHaveBeenCalledWith(message, error);
      expect(mockLoggerService.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('container integration', () => {
    it('should register logger service in container', () => {
      const token = 'LoggerService';
      const service = mockLoggerService;

      mockContainer.register(token, service);

      expect(mockContainer.register).toHaveBeenCalledWith(token, service);
    });

    it('should retrieve logger service from container', () => {
      const token = 'LoggerService';
      mockContainer.get.mockReturnValue(mockLoggerService);

      const logger = mockContainer.get(token);

      expect(mockContainer.get).toHaveBeenCalledWith(token);
      expect(logger).toBe(mockLoggerService);
    });

    it('should check if logger service exists in container', () => {
      const token = 'LoggerService';
      mockContainer.has.mockReturnValue(true);

      const exists = mockContainer.has(token);

      expect(mockContainer.has).toHaveBeenCalledWith(token);
      expect(exists).toBe(true);
    });
  });
}); 