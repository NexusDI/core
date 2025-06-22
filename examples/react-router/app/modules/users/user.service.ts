import { Service, Token } from '../../../../../src';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface IUserService {
  getUsers(): Promise<User[]>;
}

export const USER_SERVICE_TOKEN = new Token<IUserService>('UserService');

@Service()
export class UserService implements IUserService {
  async getUsers(): Promise<User[]> {
    // Simulate API call
    return [
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
      { id: '3', name: 'Charlie', email: 'charlie@example.com' },
    ];
  }
} 