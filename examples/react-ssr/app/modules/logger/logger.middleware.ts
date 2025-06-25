import type { Route } from '../../+types/root';
import { containerContext } from '../../shared/container';
import { LOGGER_SERVICE_TOKEN } from './logger.types';

// Logger middleware - actually uses the logger service from container
export const loggerMiddleware: Route.unstable_MiddlewareFunction = async (
  { context, request },
  next
) => {
  const start = performance.now();

  // Get container and logger service from context
  const container = context.get(containerContext);
  const logger = container.get(LOGGER_SERVICE_TOKEN);

  // Log request start
  logger.info('Request started', {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
  });

  try {
    // Call next middleware/route
    const response = await next();

    const duration = performance.now() - start;

    // Log successful request
    logger.info('Request completed', {
      method: request.method,
      url: request.url,
      status: response.status,
      duration: `${duration.toFixed(2)}ms`,
    });

    return response;
  } catch (error) {
    const duration = performance.now() - start;

    // Log error
    logger.error('Request failed', {
      method: request.method,
      url: request.url,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration.toFixed(2)}ms`,
    });

    throw error;
  }
};

// Performance monitoring middleware
export const performanceMiddleware: Route.unstable_MiddlewareFunction = async (
  { context, request },
  next
) => {
  const start = performance.now();

  const container = context.get(containerContext);
  const logger = container.get(LOGGER_SERVICE_TOKEN);

  const response = await next();

  const duration = performance.now() - start;

  // Log slow requests
  if (duration > 1000) {
    logger.warn('Slow request detected', {
      method: request.method,
      url: request.url,
      duration: `${duration.toFixed(2)}ms`,
      threshold: '1000ms',
    });
  }

  return response;
};
