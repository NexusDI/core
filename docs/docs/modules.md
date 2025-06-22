---
sidebar_position: 1
---

# Modules

Modules are a powerful way to organize and structure your dependency injection setup in NexusDI. They allow you to group related services, providers, and configuration into logical units.

For a complete guide to creating and using modules, see **[Module Basics](./module-basics.md)**.

## What are Modules?

A module is a class decorated with `@Module()` that defines a collection of:
- **Services** - Classes that provide functionality
- **Providers** - Dependencies that can be injected
- **Imports** - Other modules to include
- **Exports** - Services/providers to make available to other modules

## Basic Module Example

```typescript
import { Module, Service, Token, Inject } from '@nexusdi/core';

// Define tokens
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDatabase>('DATABASE');

// Define services
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private db: IDatabase) {}
  
  async getUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

// Create the module
@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useClass: PostgresDatabase }
  ]
})
export class UserModule {}
```

## Module Registration

```typescript
import { Nexus } from '@nexusdi/core';
import { UserModule } from './modules/user.module';

const container = new Nexus();
container.setModule(UserModule);
```

## Benefits of Modules

- **Organization**: Group related services and providers into logical units
- **Reusability**: Share modules across different applications
- **Testing**: Easily mock and test specific parts of your application
- **Configuration**: Encapsulate environment-specific settings
- **Composability**: Import and combine modules as needed

For detailed explanations of these benefits and advanced patterns, see **[Module Basics](./module-basics.md)** and **[Module Patterns](./module-patterns.md)**.

## Next Steps

- **[Module Basics](./module-basics.md)** - Complete guide to creating and using modules
- **[Module Patterns](./module-patterns.md)** - Advanced patterns and best practices
- **[Dynamic Modules](./dynamic-modules.md)** - Runtime configuration and validation 