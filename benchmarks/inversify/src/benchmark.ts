import {
  BenchmarkBase,
  ILoggerService,
  IDatabase,
  IUserService,
} from '@nexusdi/benchmark';
import {
  Container,
  inject,
  injectable,
  type ServiceIdentifier,
} from 'inversify';

// --- Benchmarked service implementations ---
// Create your tokens
const DATABASE: ServiceIdentifier<Database> = Symbol('DATABASE');
const LOGGER: ServiceIdentifier<LoggerService> = Symbol('LOGGER');
const USER_SERVICE: ServiceIdentifier<UserService> = Symbol('USER_SERVICE');

// Add decorators as needed for your DI container
@injectable()
export class LoggerService implements ILoggerService {
  log(message: string): void {
    // Minimal implementation
    // (In real use, could push to an array or noop)
  }
}

@injectable()
export class Database implements IDatabase {
  async getUser(id: string): Promise<{ id: string; name: string }> {
    // Simulate DB fetch
    return { id, name: `User_${id}` };
  }
}

@injectable()
export class UserService implements IUserService {
  constructor(
    @inject(Database) private db: Database,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  async getUserName(id: string): Promise<string> {
    this.logger.log(`Fetching user ${id}`);
    const user = await this.db.getUser(id);
    return user.name;
  }
}

// --- Benchmark class ---

// Implement your DI benchmark by extending BenchmarkBase
export default class InversifyBenchmark extends BenchmarkBase {
  // Set this to the npm package name or file path(s) to measure for bundle size
  bundleTarget = 'inversify';
  private container!: Container;

  // Create the DI container (do not register services here)
  async startup(): Promise<void> {
    this.container = new Container();
  }

  // Register services in the DI container (do not create the container here)
  async register(): Promise<void> {
    this.container.bind(LOGGER).to(LoggerService);
    this.container.bind(DATABASE).to(Database);
    this.container.bind(USER_SERVICE).to(UserService);
  }

  // Resolve UserService
  async resolve(): Promise<void> {
    const _userService = this.container.get(USER_SERVICE);
  }
}

// The benchmark executor will import and use this class to run the benchmark and collect results.
