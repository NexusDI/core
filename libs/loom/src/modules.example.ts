import {
  Token,
  Container,
  Service,
  InjectParam,
  Module,
  Provider,
  BaseModule,
} from './index.js';

// ============================================
// TOKENS & INTERFACES
// ============================================

const LOGGER = new Token<ILogger>('logger');
const DATABASE = new Token<IDatabase>('database');
const USER_SERVICE = new Token<IUserService>('userService');
const AUTH_SERVICE = new Token<IAuthService>('authService');
const CONFIG = new Token<IConfig>('config');

interface ILogger {
  log(message: string): void;
  error(message: string): void;
}

interface IDatabase {
  query(sql: string): Promise<any[]>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

interface IUserService {
  getUser(id: string): Promise<User>;
  createUser(userData: Partial<User>): Promise<User>;
}

interface IAuthService {
  login(username: string, password: string): Promise<string>;
  validateToken(token: string): Promise<boolean>;
}

interface IConfig {
  database: {
    host: string;
    port: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
}

interface User {
  id: string;
  username: string;
  email: string;
}

// ============================================
// CORE MODULE (Database & Logging)
// ============================================

export class LoggerService extends Provider implements ILogger {
  log(message: string): void {
    console.log(`[LOG] ${new Date().toISOString()} - ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
  }

  override async onStart(): Promise<void> {
    this.log('Logger service started');
  }
}

export class DatabaseService extends Provider implements IDatabase {
  private connected = false;

  constructor(
    @InjectParam(CONFIG) private config: IConfig,
    @InjectParam(LOGGER) private logger: ILogger
  ) {
    super();
  }

  async query(sql: string): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    this.logger.log(`Executing query: ${sql}`);
    // Simulate database query
    return [{ id: 1, result: 'mock data' }];
  }

  async connect(): Promise<void> {
    this.logger.log(
      `Connecting to database at ${this.config.database.host}:${this.config.database.port}`
    );
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.logger.log('Disconnecting from database');
    this.connected = false;
  }

  override async onStart(): Promise<void> {
    await this.connect();
  }

  override async onStop(): Promise<void> {
    await this.disconnect();
  }
}

@Module({
  providers: [
    { token: LOGGER, useClass: LoggerService },
    { token: DATABASE, useClass: DatabaseService },
    {
      token: CONFIG,
      useValue: {
        database: { host: 'localhost', port: 5432 },
        jwt: { secret: 'secret123', expiresIn: '1h' },
      },
    },
  ],
  exports: [LOGGER, DATABASE, CONFIG], // Export these for other modules
})
export class CoreModule extends BaseModule {
  override async onStart(): Promise<void> {
    console.log('🚀 Core module started');
  }

  override async onStop(): Promise<void> {
    console.log('⏹️  Core module stopped');
  }
}

// ============================================
// USER MODULE (Depends on Core)
// ============================================

export class UserService extends Provider implements IUserService {
  constructor(
    @InjectParam(DATABASE) private db: IDatabase,
    @InjectParam(LOGGER) private logger: ILogger
  ) {
    super();
  }

  async getUser(id: string): Promise<User> {
    this.logger.log(`Getting user ${id}`);
    const results = await this.db.query(
      `SELECT * FROM users WHERE id = '${id}'`
    );
    return {
      id,
      username: `user_${id}`,
      email: `user_${id}@example.com`,
    };
  }

  async createUser(userData: Partial<User>): Promise<User> {
    this.logger.log(`Creating user: ${JSON.stringify(userData)}`);
    const id = Math.random().toString(36).substr(2, 9);
    const user: User = {
      id,
      username: userData.username || `user_${id}`,
      email: userData.email || `user_${id}@example.com`,
    };
    await this.db.query(
      `INSERT INTO users (id, username, email) VALUES ('${user.id}', '${user.username}', '${user.email}')`
    );
    return user;
  }

  override async onStart(): Promise<void> {
    this.logger.log('User service started');
  }
}

@Module({
  imports: [CoreModule], // Import the core module
  providers: [{ token: USER_SERVICE, useClass: UserService }],
  exports: [USER_SERVICE], // Export user service for other modules
})
export class UserModule extends BaseModule {
  override async onStart(): Promise<void> {
    console.log('👤 User module started');
  }
}

// ============================================
// AUTH MODULE (Depends on Core & User)
// ============================================

export class AuthService extends Provider implements IAuthService {
  constructor(
    @InjectParam(USER_SERVICE) private userService: IUserService,
    @InjectParam(CONFIG) private config: IConfig,
    @InjectParam(LOGGER) private logger: ILogger
  ) {
    super();
  }

  async login(username: string, password: string): Promise<string> {
    this.logger.log(`Login attempt for user: ${username}`);

    // Simulate user lookup and password validation
    // In real app, you'd hash passwords and validate properly
    const token = this.generateToken(username);
    this.logger.log(`Login successful for user: ${username}`);
    return token;
  }

  async validateToken(token: string): Promise<boolean> {
    this.logger.log(`Validating token: ${token.substr(0, 10)}...`);
    // Simulate JWT validation
    return token.startsWith('jwt_');
  }

  private generateToken(username: string): string {
    // Simulate JWT generation
    return `jwt_${username}_${Date.now()}`;
  }

  override async onStart(): Promise<void> {
    this.logger.log('Auth service started');
  }
}

@Module({
  imports: [CoreModule, UserModule], // Import both core and user modules
  providers: [{ token: AUTH_SERVICE, useClass: AuthService }],
  exports: [AUTH_SERVICE],
})
export class AuthModule extends BaseModule {
  override async onStart(): Promise<void> {
    console.log('🔐 Auth module started');
  }
}

// ============================================
// APPLICATION MODULE (Root module)
// ============================================

@Module({
  imports: [CoreModule, UserModule, AuthModule], // Import all feature modules
  providers: [
    // Add application-specific providers here
  ],
})
export class AppModule extends BaseModule {
  override async onStart(): Promise<void> {
    console.log('🌟 Application started successfully!');
  }

  override async onStop(): Promise<void> {
    console.log('🛑 Application stopped');
  }
}

// ============================================
// USAGE EXAMPLE
// ============================================

export async function demonstrateModules(): Promise<void> {
  console.log('=== Module System Demo ===\n');

  const container = new Container();

  // Register the root module (which will cascade to import all others)
  container.register(AppModule);

  // Start the container (this will start all modules in dependency order)
  await container.onStart();
  console.log();

  // Use the services
  const logger = await container.resolve(LOGGER);
  const userService = await container.resolve(USER_SERVICE);
  const authService = await container.resolve(AUTH_SERVICE);

  // Demonstrate functionality
  logger.log('=== Testing Services ===');

  const user = await userService.createUser({
    username: 'john_doe',
    email: 'john@example.com',
  });

  const retrievedUser = await userService.getUser(user.id);
  logger.log(`Retrieved user: ${JSON.stringify(retrievedUser)}`);

  const token = await authService.login('john_doe', 'password123');
  logger.log(`Generated token: ${token}`);

  const isValid = await authService.validateToken(token);
  logger.log(`Token valid: ${isValid}`);

  console.log('\n=== Shutting down ===');

  // Stop the container (this will stop all modules in reverse order)
  await container.onStop();
  await container.onDispose();
}

// Export for testing
export { LOGGER, DATABASE, USER_SERVICE, AUTH_SERVICE, CONFIG };
