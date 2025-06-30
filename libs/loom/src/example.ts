import { Token, Container, Provider } from './index.js';

// Define tokens
const LOGGER_SERVICE = new Token<Logger>('LOGGER');
const PROFILE_URL = new Token<string>('PROFILE_URL');

// Define interfaces
interface Logger {
  log(message: string): void;
}

interface IUserService {
  getUser(id: string): Promise<{ id: string; name: string }>;
}

// Implement services
export class LoggerService extends Provider implements Logger {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }

  override async onStart(): Promise<void> {
    this.log('Logger service started');
  }
}

export class UserService extends Provider implements IUserService {
  constructor(private logger: Logger) {
    super();
  }

  async getUser(id: string): Promise<{ id: string; name: string }> {
    this.logger.log(`Getting user ${id}`);
    return { id, name: `User ${id}` };
  }

  override async onStart(): Promise<void> {
    this.logger.log('User service started');
  }
}

// Usage example
export async function demonstrateUsage(): Promise<void> {
  const container = new Container();

  // Register using the simplified API
  container.register(
    [LOGGER_SERVICE, LoggerService],
    [LOGGER_SERVICE, { useFactory: () => new LoggerService() }],
    [PROFILE_URL, { useValue: 'http://example.com/profile' }]
  );

  // Start the container
  await container.onStart();

  // Resolve services
  const logger = await container.resolve(LOGGER_SERVICE);
  const profileUrl = await container.resolve(PROFILE_URL);

  // Use services
  logger.log('Container is ready!');
  console.log('Profile URL:', profileUrl);

  // Clean up
  await container.onDispose();
}
