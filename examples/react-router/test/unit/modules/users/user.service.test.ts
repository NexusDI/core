import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Nexus } from '../../../../../src';
import { UserService, USER_SERVICE_TOKEN, type User } from '../../../../app/modules/users/user.service';

describe('UserService', () => {
  let container: Nexus;
  let userService: UserService;

  beforeEach(() => {
    container = new Nexus();
    container.register(USER_SERVICE_TOKEN, UserService);
    userService = container.get(USER_SERVICE_TOKEN);
  });

  describe('getUsers', () => {
    it('should return a list of users', async () => {
      const users = await userService.getUsers();
      
      expect(users).toBeInstanceOf(Array);
      expect(users.length).toBeGreaterThan(0);
      
      const firstUser = users[0];
      expect(firstUser).toHaveProperty('id');
      expect(firstUser).toHaveProperty('name');
      expect(firstUser).toHaveProperty('email');
    });

    it('should return users with correct structure', async () => {
      const users = await userService.getUsers();
      
      users.forEach((user: User) => {
        expect(user).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
        });
      });
    });

    it('should return predefined users', async () => {
      const users = await userService.getUsers();
      
      expect(users).toHaveLength(3);
      expect(users[0]).toMatchObject({
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(users[1]).toMatchObject({
        id: '2',
        name: 'Bob',
        email: 'bob@example.com',
      });
      expect(users[2]).toMatchObject({
        id: '3',
        name: 'Charlie',
        email: 'charlie@example.com',
      });
    });
  });
}); 