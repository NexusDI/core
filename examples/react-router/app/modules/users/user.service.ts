import { Service, Inject } from '@nexusdi/core';
import {
  USER_SERVICE_TOKEN,
  USERS_CONFIG_TOKEN,
  type IUserService,
  type User,
  type UsersConfig,
} from './users.types';

@Service(USER_SERVICE_TOKEN)
export class UserService implements IUserService {
  private cache = new Map<string, { data: User[]; timestamp: number }>();

  constructor(@Inject(USERS_CONFIG_TOKEN) private config: UsersConfig) {}

  private async fetchFromAPI(
    page = 1,
    limit = this.config.maxUsersPerPage
  ): Promise<User[]> {
    if (this.config.enableMockData) {
      // Return mock data
      return [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
        { id: '3', name: 'Charlie', email: 'charlie@example.com' },
        { id: '4', name: 'Diana', email: 'diana@example.com' },
        { id: '5', name: 'Eve', email: 'eve@example.com' },
      ].slice((page - 1) * limit, page * limit);
    }

    // In a real implementation, you'd make an actual API call
    const url = `${this.config.apiUrl}?page=${page}&limit=${limit}`;
    console.log(`[UserService] Fetching users from: ${url}`);

    // Simulate API call
    return [
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
      { id: '3', name: 'Charlie', email: 'charlie@example.com' },
    ];
  }

  private getCacheKey(page: number, limit: number): string {
    return `users:${page}:${limit}`;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.config.cacheTTL * 1000;
  }

  async getUsers(
    page = 1,
    limit = this.config.maxUsersPerPage
  ): Promise<User[]> {
    const cacheKey = this.getCacheKey(page, limit);

    // Check cache if enabled
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheValid(cached.timestamp)) {
        console.log(`[UserService] Returning cached users for page ${page}`);
        return cached.data;
      }
    }

    // Fetch from API
    const users = await this.fetchFromAPI(page, limit);

    // Cache if enabled
    if (this.config.cacheEnabled) {
      this.cache.set(cacheKey, {
        data: users,
        timestamp: Date.now(),
      });
    }

    return users;
  }

  async getUserById(id: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find((user) => user.id === id) || null;
  }
}

// Re-export types for convenience
export { type User, type IUserService, USER_SERVICE_TOKEN };
