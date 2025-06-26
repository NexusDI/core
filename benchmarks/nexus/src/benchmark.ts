import {
  BenchmarkBase,
  type ILoggerService,
  type IDatabase,
  type IUserService,
} from '@nexusdi/benchmark';
import { Nexus, Token, Service, Inject } from '@nexusdi/core';

// --- Benchmarked service implementations ---
const DATABASE = new Token<IDatabase>('DATABASE');
const LOGGER = new Token<ILoggerService>('LOGGER');
const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

// Add decorators as needed for your DI container
@Service(LOGGER)
export class LoggerService implements ILoggerService {
  log(message: string): void {
    // Minimal implementation
    // (In real use, could push to an array or noop)
  }
}

@Service(DATABASE)
export class Database implements IDatabase {
  async getUser(id: string): Promise<{ id: string; name: string }> {
    // Simulate DB fetch
    return { id, name: `User_${id}` };
  }
}

@Service(USER_SERVICE)
export class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private db: IDatabase,
    @Inject(LOGGER) private logger: ILoggerService
  ) {}

  async getUserName(id: string): Promise<string> {
    this.logger.log(`Fetching user ${id}`);
    const user = await this.db.getUser(id);
    return user.name;
  }
}

// --- Benchmark class ---

// Implement your DI benchmark by extending BenchmarkBase
export default class NexusBenchmark extends BenchmarkBase {
  private container!: Nexus;
  bundleTarget = '@nexusdi/core';

  // Initialize the container
  async startup(): Promise<void> {
    this.container = new Nexus();
  }

  // Register the services
  async register(): Promise<void> {
    this.container.set(LOGGER, { useClass: LoggerService });
    this.container.set(DATABASE, { useClass: Database });
    this.container.set(USER_SERVICE, { useClass: UserService });
  }

  // Resolve UserService
  async resolve(): Promise<void> {
    const _userService = this.container.get(USER_SERVICE);
  }
}
