import { Nexus } from '../../../../src';
import { unstable_createContext } from 'react-router';
import type { Route } from '../+types/root';
import { UsersModule } from '../modules/users/users.module';
import { LoggerModule } from '../modules/logger/logger.module';

// Global container instance for SSR
let globalContainer: Nexus | null = null;

// Create a context for the DI container
export const containerContext = unstable_createContext<Nexus>();

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
    globalContainer.registerModule(LoggerModule); // Register logger module first
    globalContainer.registerModule(UsersModule);
    console.log('Container created and modules registered');
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