/**
 * Example demonstrating dynamic module configuration,
 * similar to industry-leading frameworks.
 */

import { Nexus, Module, Service, Token, Inject, DynamicModule } from '../src';

// Configuration interfaces
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
}

interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun';
  apiKey?: string;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
  };
}

// Configuration tokens
const DATABASE_CONFIG = new Token<DatabaseConfig>('DATABASE_CONFIG');
const EMAIL_CONFIG = new Token<EmailConfig>('EMAIL_CONFIG');

// Service interfaces
interface IDatabaseService {
  connect(): Promise<void>;
  query(sql: string): Promise<any>;
}

interface IEmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

// Service tokens
const DATABASE_SERVICE = new Token<IDatabaseService>('DatabaseService');
const EMAIL_SERVICE = new Token<IEmailService>('EmailService');

// Database Service
@Service(DATABASE_SERVICE)
class DatabaseService implements IDatabaseService {
  constructor(@Inject(DATABASE_CONFIG) private config: DatabaseConfig) {}

  async connect(): Promise<void> {
    console.log(`Connecting to database: ${this.config.host}:${this.config.port}/${this.config.database}`);
    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('Database connected successfully');
  }

  async query(sql: string): Promise<any> {
    console.log(`Executing query: ${sql}`);
    // Simulate query execution
    return { rows: [], count: 0 };
  }
}

// Email Service
@Service(EMAIL_SERVICE)
class EmailService implements IEmailService {
  constructor(@Inject(EMAIL_CONFIG) private config: EmailConfig) {}

  async send(to: string, subject: string, body: string): Promise<void> {
    console.log(`Sending email via ${this.config.provider}:`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${body}`);
    
    if (this.config.provider === 'smtp' && this.config.smtpConfig) {
      console.log(`  SMTP Config: ${this.config.smtpConfig.host}:${this.config.smtpConfig.port}`);
    } else if (this.config.apiKey) {
      console.log(`  Using API key: ${this.config.apiKey.substring(0, 8)}...`);
    }
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 50));
    console.log('Email sent successfully');
  }
}

// Database Module with DynamicModule base class
@Module({
  services: [DatabaseService],
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
}

// Email Module with DynamicModule base class
@Module({
  services: [EmailService],
})
class EmailModule extends DynamicModule<EmailConfig> {
  protected readonly configToken = EMAIL_CONFIG;
}

// Example usage
async function main() {
  console.log('=== Dynamic Module Configuration Example ===\n');

  // Example 1: Development configuration
  console.log('1. Development Configuration:');
  const devContainer = new Nexus();
  devContainer.registerDynamicModule(DatabaseModule.config({
    host: 'localhost',
    port: 5432,
    database: 'dev_db',
    username: 'dev_user',
    password: 'dev_pass'
  }));
  devContainer.registerDynamicModule(EmailModule.config({
    provider: 'smtp',
    smtpConfig: {
      host: 'localhost',
      port: 1025,
      secure: false
    }
  }));

  const devDb = devContainer.get(DATABASE_SERVICE);
  const devEmail = devContainer.get(EMAIL_SERVICE);

  await devDb.connect();
  await devEmail.send('dev@example.com', 'Test', 'Development email');
  console.log();

  // Example 2: Production configuration
  console.log('2. Production Configuration:');
  const prodContainer = new Nexus();
  prodContainer.registerDynamicModule(DatabaseModule.config({
    host: process.env.DB_HOST || 'prod-db.example.com',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'prod_db',
    username: process.env.DB_USER,
    password: process.env.DB_PASS
  }));
  prodContainer.registerDynamicModule(EmailModule.config({
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY || ''
  }));

  const prodDb = prodContainer.get(DATABASE_SERVICE);
  const prodEmail = prodContainer.get(EMAIL_SERVICE);

  await prodDb.connect();
  await prodEmail.send('prod@example.com', 'Test', 'Production email');
  console.log();

  // Example 3: Custom configuration
  console.log('3. Custom Configuration:');
  const customContainer = new Nexus();
  customContainer.registerDynamicModule(DatabaseModule.config({
    host: 'custom-db.example.com',
    port: 3306,
    database: 'custom_db',
    username: 'custom_user',
    password: 'custom_pass'
  }));
  customContainer.registerDynamicModule(EmailModule.config({
    provider: 'mailgun',
    apiKey: 'mg-custom-key'
  }));

  const customDb = customContainer.get(DATABASE_SERVICE);
  const customEmail = customContainer.get(EMAIL_SERVICE);

  await customDb.connect();
  await customEmail.send('custom@example.com', 'Test', 'Custom email');
  console.log();

  // Example 4: Environment-based configuration
  console.log('4. Environment-Based Configuration:');
  const env = process.env.NODE_ENV || 'development';
  const envContainer = new Nexus();

  if (env === 'production') {
    envContainer.registerDynamicModule(DatabaseModule.config({
      host: process.env.DB_HOST || 'prod-db.example.com',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'prod_db',
      username: process.env.DB_USER,
      password: process.env.DB_PASS
    }));
    envContainer.registerDynamicModule(EmailModule.config({
      provider: 'sendgrid',
      apiKey: process.env.SENDGRID_API_KEY || ''
    }));
  } else if (env === 'test') {
    envContainer.registerDynamicModule(DatabaseModule.config({
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_pass'
    }));
    envContainer.registerDynamicModule(EmailModule.config({
      provider: 'smtp',
      smtpConfig: {
        host: 'localhost',
        port: 1025,
        secure: false
      }
    }));
  } else {
    envContainer.registerDynamicModule(DatabaseModule.config({
      host: 'localhost',
      port: 5432,
      database: 'dev_db',
      username: 'dev_user',
      password: 'dev_pass'
    }));
    envContainer.registerDynamicModule(EmailModule.config({
      provider: 'smtp',
      smtpConfig: {
        host: 'localhost',
        port: 1025,
        secure: false
      }
    }));
  }

  const envDb = envContainer.get(DATABASE_SERVICE);
  const envEmail = envContainer.get(EMAIL_SERVICE);

  await envDb.connect();
  await envEmail.send('env@example.com', 'Test', `Environment: ${env}`);
  console.log();

  console.log('=== Example completed successfully! ===');
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export {
  DatabaseModule,
  EmailModule,
  DatabaseService,
  EmailService,
  DATABASE_SERVICE,
  EMAIL_SERVICE,
  type DatabaseConfig,
  type EmailConfig
}; 