import { Nexus } from '@nexusdi/core';
import { unstable_createContext } from 'react-router';
import type { Route } from '../+types/root';
import { UsersModule } from '../modules/users/users.module';
import { LoggerModule } from '../modules/logger/logger.module';

// Global container instance for SSR
const globalContainer = new Nexus();
const env = getEnvironment();

globalContainer.set(
  LoggerModule.config({
    level: env === 'production' ? 'info' : 'debug',
    format: env === 'production' ? 'json' : 'text',
    enableConsole: true,
    enableFile: env === 'production',
    filePath: env === 'production' ? '/var/log/app.log' : undefined,
  })
);

globalContainer.set(
  UsersModule.config({
    apiUrl:
      env === 'production'
        ? process.env.USERS_API_URL || 'https://api.example.com/users'
        : 'http://localhost:3001/api/users',
    cacheEnabled: env === 'production',
    cacheTTL: env === 'production' ? 3600 : 300,
    maxUsersPerPage: env === 'production' ? 50 : 10,
    enableMockData: env !== 'production',
  })
);

// Create a context for the DI container
export const containerContext = unstable_createContext<Nexus>(globalContainer);

function getEnvironment(): 'development' | 'production' | 'test' {
  if (typeof process !== 'undefined' && process.env.NODE_ENV) {
    return process.env.NODE_ENV as 'development' | 'production' | 'test';
  }
  return 'development';
}

// Container middleware - provides DI container to downstream middleware/loaders
export const containerMiddleware: Route.unstable_MiddlewareFunction = async (
  { context },
  next
) => {
  console.log('Container middleware called');

  try {
    const container = context.get(containerContext);
    console.log('Container retrieved in middleware:', container);

    context.set(containerContext, container);
    console.log('Container set in context');

    const response = await next();
    console.log('Container middleware completed');

    return response;
  } catch (error) {
    console.error('Error in container middleware:', error);
    throw error;
  }
};
