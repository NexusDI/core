import { Nexus, Service, Inject, Token } from '../src';

// Define interfaces for better contracts
interface ILogger {
  log(message: string): void;
  error(message: string): void;
}

interface IUserService {
  getUser(id: string): Promise<User>;
  createUser(user: CreateUserDto): Promise<User>;
}

interface IDataSource {
  query(sql: string): Promise<any>;
}

// Create tokens for type-safe dependency injection
export const LOGGER = new Token<ILogger>('LOGGER');
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDataSource>('DATABASE');

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

// Implement services using interfaces and tokens
@Service(LOGGER)
class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }
}

@Service(DATABASE)
class InMemoryDatabase implements IDataSource {
  private users: User[] = [
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
  ];

  async query(sql: string): Promise<any> {
    // Simple mock implementation
    if (sql.includes('SELECT')) {
      return this.users;
    }
    if (sql.includes('INSERT')) {
      const newUser: User = {
        id: (this.users.length + 1).toString(),
        name: 'New User',
        email: 'new@example.com'
      };
      this.users.push(newUser);
      return [newUser];
    }
    return [];
  }
}

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDataSource,
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async getUser(id: string): Promise<User> {
    this.logger.log(`Fetching user with id: ${id}`);
    const result = await this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
    return result.find((user: User) => user.id === id);
  }

  async createUser(userData: CreateUserDto): Promise<User> {
    this.logger.log(`Creating new user: ${userData.name}`);
    const result = await this.database.query(
      `INSERT INTO users (name, email) VALUES ('${userData.name}', '${userData.email}') RETURNING *`
    );
    return result[0];
  }
}

// Usage
async function main() {
  const nexus = new Nexus();

  // Register services with tokens
  nexus.set(LOGGER, { useClass: ConsoleLogger });
  nexus.set(DATABASE, { useClass: InMemoryDatabase });
  nexus.set(USER_SERVICE, { useClass: UserService });

  // Get services using tokens (type-safe)
  const userService = nexus.get(USER_SERVICE);
  const logger = nexus.get(LOGGER);

  // Use the services
  logger.log('Starting user operations...');

  try {
    const user = await userService.getUser('1');
    console.log('Retrieved user:', user);

    const newUser = await userService.createUser({
      name: 'Alice Johnson',
      email: 'alice@example.com'
    });
    console.log('Created user:', newUser);
  } catch (error) {
    logger.error('Error occurred during user operations');
  }
}

// Run the example
main().catch(console.error); 