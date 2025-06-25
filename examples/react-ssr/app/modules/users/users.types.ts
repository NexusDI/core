import { Token } from '@nexusdi/core';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface IUserService {
  getUsers(page?: number, limit?: number): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  createUser(user: Omit<User, 'id'>): Promise<User>;
}

export interface UsersConfig {
  apiUrl: string;
  cacheEnabled: boolean;
  cacheTTL: number;
  maxUsersPerPage: number;
  enableMockData?: boolean;
}

// Shared tokens
export const USER_SERVICE_TOKEN = new Token<IUserService>('UserService');
export const USERS_CONFIG_TOKEN = new Token<UsersConfig>('USERS_CONFIG');
