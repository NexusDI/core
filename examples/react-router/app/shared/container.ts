import { Nexus } from '../../../../src';
import { unstable_createContext } from 'react-router';
import type { Route } from '../+types/root';
import { UsersModule } from '../modules/users/users.module';
import { LoggerModule } from '../modules/logger/logger.module';

// Global container instance for SSR
let globalContainer: Nexus | null = null;

// Create a context for the DI container
export const containerContext = unstable_createContext<Nexus>();

function getEnvironment(): 'development' | 'production' | 'test' {
  if (typeof process !== 'undefined' && process.env.NODE_ENV) {
    return process.env.NODE_ENV as 'development' | 'production' | 'test';
  }
  return 'development';
}

export function getContainer(context?: Route.LoaderArgs['context']): Nexus {
  // If context is provided, try to get container from context first
  if (context) {
    try {
      const contextContainer = context.get(containerContext);
      if (contextContainer) {
        return contextContainer;
      }
    } catch (error) {
      console.log('No container in context, falling back to global container');
    }
  }

  // Fall back to global container
  if (!globalContainer) {
    console.log('Creating new container instance');
    globalContainer = new Nexus();
    
    const env = getEnvironment();
    console.log(`Configuring container for environment: ${env}`);
    
    // Register modules with environment-specific configuration
    globalContainer.set(LoggerModule.config({
      level: env === 'production' ? 'info' : 'debug',
      format: env === 'production' ? 'json' : 'text',
      enableConsole: true,
      enableFile: env === 'production',
      filePath: env === 'production' ? '/var/log/app.log' : undefined,
    }));
    
    globalContainer.set(UsersModule.config({
      apiUrl: env === 'production' 
        ? (process.env.USERS_API_URL || 'https://api.example.com/users')
        : 'http://localhost:3001/api/users',
      cacheEnabled: env === 'production',
      cacheTTL: env === 'production' ? 3600 : 300,
      maxUsersPerPage: env === 'production' ? 50 : 10,
      enableMockData: env !== 'production',
    }));
    
    console.log('Container created and modules registered with environment-specific config');
  }
  return globalContainer;
}

export function resetContainer(): void {
  globalContainer = null;
}

// For testing/mocking
export function setContainer(container: Nexus): void {
  globalContainer = container;
}

// Container middleware - provides DI container to downstream middleware/loaders
export const containerMiddleware: Route.unstable_MiddlewareFunction = async ({ context }, next) => {
  console.log('Container middleware called');
  
  try {
    const container = getContainer();
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