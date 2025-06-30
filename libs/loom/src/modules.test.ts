import { describe, it, expect, beforeEach } from 'vitest';
import { Token, Container, Provider, BaseModule } from './index.js';
import { setModuleMetadata } from './metadata.js';

describe('Modules', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('should register and process a basic module', async () => {
    // Define tokens
    const LOGGER = new Token<ILogger>('logger');
    const CONFIG = new Token<IConfig>('config');

    interface ILogger {
      log(message: string): void;
    }

    interface IConfig {
      appName: string;
    }

    // Create services
    class LoggerService extends Provider implements ILogger {
      log(message: string): void {
        console.log(`[LOG] ${message}`);
      }
    }

    // Create module class
    class CoreModule extends BaseModule {}

    // Set module metadata manually
    setModuleMetadata(CoreModule, {
      providers: [
        { token: LOGGER, useClass: LoggerService },
        { token: CONFIG, useValue: { appName: 'TestApp' } },
      ],
      exports: [LOGGER, CONFIG],
    });

    // Register the module
    container.registerModule(CoreModule);

    // Start container
    await container.onStart();

    // Resolve services
    const logger = await container.resolve(LOGGER);
    const config = await container.resolve(CONFIG);

    expect(logger).toBeInstanceOf(LoggerService);
    expect(config.appName).toBe('TestApp');

    // Clean up
    await container.onDispose();
  });

  it('should handle module imports and dependencies', async () => {
    // Define tokens
    const LOGGER = new Token<ILogger>('logger');
    const DATABASE = new Token<IDatabase>('database');
    const USER_SERVICE = new Token<IUserService>('userService');

    interface ILogger {
      log(message: string): void;
    }

    interface IDatabase {
      query(sql: string): Promise<any[]>;
    }

    interface IUserService {
      getUser(id: string): Promise<{ id: string; name: string }>;
    }

    // Create services
    class LoggerService extends Provider implements ILogger {
      log(message: string): void {
        console.log(`[LOG] ${message}`);
      }
    }

    class DatabaseService extends Provider implements IDatabase {
      async query(sql: string): Promise<any[]> {
        return [{ id: 1, result: 'mock data' }];
      }
    }

    class UserService extends Provider implements IUserService {
      constructor(private logger: ILogger, private database: IDatabase) {
        super();
      }

      async getUser(id: string): Promise<{ id: string; name: string }> {
        this.logger.log(`Getting user ${id}`);
        await this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
        return { id, name: `User ${id}` };
      }
    }

    // Create modules
    class CoreModule extends BaseModule {}
    class UserModule extends BaseModule {}

    // Set module metadata
    setModuleMetadata(CoreModule, {
      providers: [
        { token: LOGGER, useClass: LoggerService },
        { token: DATABASE, useClass: DatabaseService },
      ],
      exports: [LOGGER, DATABASE],
    });

    setModuleMetadata(UserModule, {
      imports: [CoreModule],
      providers: [
        {
          token: USER_SERVICE,
          useFactory: async (logger: ILogger, database: IDatabase) =>
            new UserService(logger, database),
          deps: [LOGGER, DATABASE],
        },
      ],
      exports: [USER_SERVICE],
    });

    // Register the user module (which will import core module)
    container.registerModule(UserModule);

    // Start container
    await container.onStart();

    // Resolve services
    const userService = await container.resolve(USER_SERVICE);
    const user = await userService.getUser('123');

    expect(user.id).toBe('123');
    expect(user.name).toBe('User 123');

    // Clean up
    await container.onDispose();
  });

  it('should handle module lifecycle', async () => {
    const startOrder: string[] = [];
    const stopOrder: string[] = [];

    class CoreModule extends BaseModule {
      override async onStart(): Promise<void> {
        startOrder.push('CoreModule');
      }

      override async onStop(): Promise<void> {
        stopOrder.push('CoreModule');
      }
    }

    class UserModule extends BaseModule {
      override async onStart(): Promise<void> {
        startOrder.push('UserModule');
      }

      override async onStop(): Promise<void> {
        stopOrder.push('UserModule');
      }
    }

    class AppModule extends BaseModule {
      override async onStart(): Promise<void> {
        startOrder.push('AppModule');
      }

      override async onStop(): Promise<void> {
        stopOrder.push('AppModule');
      }
    }

    // Set module metadata
    setModuleMetadata(CoreModule, {
      providers: [],
      exports: [],
    });

    setModuleMetadata(UserModule, {
      imports: [CoreModule],
      providers: [],
      exports: [],
    });

    setModuleMetadata(AppModule, {
      imports: [CoreModule, UserModule],
      providers: [],
      exports: [],
    });

    // Register the app module
    container.registerModule(AppModule);

    // Start container
    await container.onStart();

    // Stop container
    await container.onStop();

    // Modules should start in dependency order
    expect(startOrder).toEqual(['CoreModule', 'UserModule', 'AppModule']);

    // Modules should stop in reverse order
    expect(stopOrder).toEqual(['AppModule', 'UserModule', 'CoreModule']);
  });

  it('should prevent duplicate module registration', async () => {
    class TestModule extends BaseModule {}

    setModuleMetadata(TestModule, {
      providers: [],
      exports: [],
    });

    // Register the same module twice
    container.registerModule(TestModule);
    container.registerModule(TestModule);

    // Should not cause issues
    await container.onStart();
    await container.onDispose();
  });

  it('should register modules through the main register method', async () => {
    const TEST_TOKEN = new Token<string>('test');

    class TestModule extends BaseModule {}

    setModuleMetadata(TestModule, {
      providers: [{ token: TEST_TOKEN, useValue: 'module value' }],
      exports: [TEST_TOKEN],
    });

    // Register module through main register method
    container.register(TestModule);

    // Start and resolve
    await container.onStart();
    const value = await container.resolve(TEST_TOKEN);

    expect(value).toBe('module value');

    await container.onDispose();
  });
});
