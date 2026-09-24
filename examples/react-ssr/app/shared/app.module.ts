import { defineModule } from '@nexusdi/core';
import { LoggerModule } from '../modules/logger/logger.module';
import { UsersModule } from '../modules/users/users.module';

function getEnvironment(): 'development' | 'production' | 'test' {
  if (typeof process !== 'undefined' && process.env.NODE_ENV) {
    return process.env.NODE_ENV as 'development' | 'production' | 'test';
  }
  return 'development';
}

const env = getEnvironment();

export const AppModule = defineModule({
  name: 'AppModule',
  imports: [
    LoggerModule.with({
      level: env === 'production' ? 'info' : 'debug',
      format: env === 'production' ? 'json' : 'text',
      enableConsole: true,
      enableFile: env === 'production',
      filePath: env === 'production' ? '/var/log/app.log' : undefined,
    }),
    UsersModule.with({
      apiUrl:
        env === 'production'
          ? process.env.USERS_API_URL || 'https://api.example.com/users'
          : 'http://localhost:3001/api/users',
      cacheEnabled: env === 'production',
      cacheTTL: env === 'production' ? 3600 : 300,
      maxUsersPerPage: env === 'production' ? 50 : 10,
      enableMockData: env !== 'production',
    }),
  ],
});
