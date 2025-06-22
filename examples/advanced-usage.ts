import 'reflect-metadata';
import { Nexus, Module, Service, Inject, Token } from '../src';

// Define interfaces for better contracts
interface ILogger {
  log(message: string): void;
  error(message: string): void;
  warn(message: string): void;
}

interface IEmailService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

interface IUserService {
  getUser(id: string): Promise<User>;
  createUser(user: CreateUserDto): Promise<User>;
  sendWelcomeEmail(userId: string): Promise<void>;
}

interface IDataSource {
  // biome-ignore lint/suspicious/noExplicitAny: Mock database implementation for example purposes
  query(sql: string): Promise<any>;
}

interface IConfig {
  databaseUrl: string;
  emailApiKey: string;
  environment: string;
}

// Create tokens for type-safe dependency injection
export const LOGGER = new Token<ILogger>('LOGGER');
export const EMAIL_SERVICE = new Token<IEmailService>('EMAIL_SERVICE');
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDataSource>('DATABASE');
export const CONFIG = new Token<IConfig>('CONFIG');

// DTOs
interface User {
  id: string;
  name: string;
  email: string;
}

interface CreateUserDto {
  name: string;
  email: string;
}

// Configuration service
@Service(CONFIG)
class AppConfig implements IConfig {
  databaseUrl: string;
  emailApiKey: string;
  environment: string;

  constructor() {
    this.databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/myapp';
    this.emailApiKey = process.env.EMAIL_API_KEY || 'test-key';
    this.environment = process.env.NODE_ENV || 'development';
  }
}

// Logger service with different implementations
@Service(LOGGER)
class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
  }

  warn(message: string): void {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`);
  }
}

// Database service with configuration injection
@Service(DATABASE)
class PostgresDatabase implements IDataSource {
  // biome-ignore lint/suspicious/noExplicitAny: Mock database connection for example purposes
  private connection: any;

  // @ts-expect-error - Decorator is valid
  constructor(@Inject(CONFIG) private config: IConfig) {
    this.connection = { url: config.databaseUrl }; // Mock connection
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mock database implementation for example purposes
  async query(sql: string): Promise<any> {
    // Mock implementation
    if (sql.includes('SELECT')) {
      return [
        { id: '1', name: 'John Doe', email: 'john@example.com' },
        { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
      ];
    }
    if (sql.includes('INSERT')) {
      return [{ id: '3', name: 'New User', email: 'new@example.com' }];
    }
    return [];
  }
}

// Email service with configuration
@Service(EMAIL_SERVICE)
class SendGridEmailService implements IEmailService {
  constructor(
    // @ts-expect-error - Decorator is valid
    @Inject(CONFIG) private config: IConfig,
    // @ts-expect-error - Decorator is valid
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async sendEmail(to: string, _subject: string, _body: string): Promise<void> {
    this.logger.log(`Sending email to ${to} using SendGrid (API Key: ${this.config.emailApiKey})`);
    // Mock email sending
    await new Promise(resolve => setTimeout(resolve, 100));
    this.logger.log(`Email sent successfully to ${to}`);
  }
}

// User service with multiple dependencies
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    // @ts-expect-error - Decorator is valid
    @Inject(DATABASE) private database: IDataSource,
    // @ts-expect-error - Decorator is valid
    @Inject(LOGGER) private logger: ILogger,
    // @ts-expect-error - Decorator is valid
    @Inject(EMAIL_SERVICE) private emailService: IEmailService
  ) {}

  async getUser(id: string): Promise<User> {
    this.logger.log(`Fetching user with id: ${id}`);
    const result = await this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
    const user = result.find((u: User) => u.id === id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }
    return user;
  }

  async createUser(userData: CreateUserDto): Promise<User> {
    this.logger.log(`Creating new user: ${userData.name}`);
    const result = await this.database.query(
      `INSERT INTO users (name, email) VALUES ('${userData.name}', '${userData.email}') RETURNING *`
    );
    const newUser = result[0];
    this.logger.log(`User created successfully: ${newUser.id}`);
    return newUser;
  }

  async sendWelcomeEmail(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    await this.emailService.sendEmail(
      user.email,
      'Welcome to Our Platform!',
      `Hi ${user.name}, welcome to our platform!`
    );
  }
}

// Module configuration
@Module({
  services: [AppConfig, ConsoleLogger, PostgresDatabase, SendGridEmailService, UserService],
  providers: [
    { token: CONFIG, useClass: AppConfig },
    { token: LOGGER, useClass: ConsoleLogger },
    { token: DATABASE, useClass: PostgresDatabase },
    { token: EMAIL_SERVICE, useClass: SendGridEmailService },
    { token: USER_SERVICE, useClass: UserService }
  ]
})
class AppModule {}

// Factory provider example
function createDevelopmentLogger(): ILogger {
  return {
    log: (message: string) => console.log(`[DEV] ${message}`),
    error: (message: string) => console.error(`[DEV ERROR] ${message}`),
    warn: (message: string) => console.warn(`[DEV WARN] ${message}`)
  };
}

// Usage with different configurations
async function main() {
  const nexus = new Nexus();

  // Register the module
  nexus.registerModule(AppModule);

  // Override logger for development
  if (process.env.NODE_ENV === 'development') {
    nexus.set(LOGGER, {
      useFactory: createDevelopmentLogger
    });
  }

  // Get services using tokens
  const userService = nexus.get(USER_SERVICE);
  const logger = nexus.get(LOGGER);
  const config = nexus.get(CONFIG);

  logger.log(`Starting application in ${config.environment} mode`);

  try {
    // Create a new user
    const newUser = await userService.createUser({
      name: 'Alice Johnson',
      email: 'alice@example.com'
    });
    console.log('Created user:', newUser);

    // Send welcome email
    await userService.sendWelcomeEmail(newUser.id);
    console.log('Welcome email sent');

    // Get existing user
    const existingUser = await userService.getUser('1');
    console.log('Retrieved user:', existingUser);

  } catch (error) {
    logger.error(`Error occurred: ${error}`);
  }
}

// Child container example
function demonstrateChildContainer() {
  const parentNexus = new Nexus();
  parentNexus.registerModule(AppModule);

  // Create child container with overridden configuration
  const childNexus = parentNexus.createChildContainer();
  
  // Override logger in child container
  childNexus.set(LOGGER, {
    useFactory: createDevelopmentLogger
  });

  const childLogger = childNexus.get(LOGGER);
  const parentLogger = parentNexus.get(LOGGER);

  childLogger.log('This is from child container');
  parentLogger.log('This is from parent container');
}

// Run examples
main().catch(console.error);
demonstrateChildContainer(); 