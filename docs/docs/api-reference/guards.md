---
sidebar_position: 5
title: 'Guards'
description: 'Complete reference for all NexusDI guard functions. Learn how to use type checking and validation utilities effectively.'
tags: ['guards', 'api', 'reference', 'type-checking', 'validation']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🛡️ Guards

Guards are the sentinels of NexusDI - they protect your code from invalid types and configurations. Think of them as the security systems of a starship, constantly checking that everything is as it should be. This reference covers all the guard functions available in NexusDI.

## 🎯 What are Guards?

Guards are utility functions that perform runtime type checking and validation. They help you:

- Validate tokens and providers
- Check types at runtime
- Ensure configuration integrity
- Debug dependency injection issues
- Write more robust code

## 🔍 Token Guards

### `isTokenType<T>(token: unknown): token is TokenType<T>`

Checks if a value is a valid token type (constructor, symbol, or Token instance).

```tsx
import { isTokenType } from 'nexusdi-core';

// String token
if (isTokenType('userService')) {
  console.log('Valid string token');
}

// Symbol token
const symbolToken = Symbol('userService');
if (isTokenType(symbolToken)) {
  console.log('Valid symbol token');
}

// Class token
if (isTokenType(UserService)) {
  console.log('Valid class token');
}

// Token instance
const token = new Token('userService');
if (isTokenType(token)) {
  console.log('Valid Token instance');
}
```

### `isToken<T>(token: unknown): token is Token<T>`

Checks if a value is a Token instance.

```tsx
import { isToken } from 'nexusdi-core';

const token = new Token('userService');

if (isToken(token)) {
  console.log('This is a Token instance');
  console.log('Token name:', token.name);
}
```

### `isSymbol(obj: unknown): obj is symbol`

Checks if a value is a symbol.

```tsx
import { isSymbol } from 'nexusdi-core';

const symbolToken = Symbol('userService');

if (isSymbol(symbolToken)) {
  console.log('This is a symbol');
}
```

## 🏗️ Constructor Guards

### `isConstructor<T>(obj: unknown): obj is Constructor<T>`

Checks if a value is a constructor function.

```tsx
import { isConstructor } from 'nexusdi-core';

class UserService {}

if (isConstructor(UserService)) {
  console.log('UserService is a constructor');
}

if (isConstructor('not a constructor')) {
  console.log('This will not execute');
}
```

**Example:**

```tsx
function registerService(service: unknown) {
  if (isConstructor(service)) {
    // TypeScript now knows service is a constructor
    container.set(service, () => new service());
  } else {
    throw new Error('Service must be a constructor');
  }
}
```

## 📦 Provider Guards

### `isProvider(obj: unknown): obj is Provider`

Checks if a value is a provider configuration object.

```tsx
import { isProvider } from 'nexusdi-core';

const classProvider = {
  useClass: UserService,
};

const valueProvider = {
  useValue: 'some value',
};

const factoryProvider = {
  useFactory: container => new UserService(),
};

if (isProvider(classProvider)) {
  console.log('This is a class provider');
}

if (isProvider(valueProvider)) {
  console.log('This is a value provider');
}

if (isProvider(factoryProvider)) {
  console.log('This is a factory provider');
}
```

### `isClassProvider<T>(obj: unknown): obj is ClassProvider<T>`

Checks if a value is a class provider.

```tsx
import { isClassProvider } from 'nexusdi-core';

const classProvider = {
  useClass: UserService,
};

if (isClassProvider(classProvider)) {
  console.log('This is a class provider');
  console.log('Class:', classProvider.useClass);
}
```

### `isValueProvider<T>(obj: unknown): obj is ValueProvider<T>`

Checks if a value is a value provider.

```tsx
import { isValueProvider } from 'nexusdi-core';

const valueProvider = {
  useValue: 'some value',
};

if (isValueProvider(valueProvider)) {
  console.log('This is a value provider');
  console.log('Value:', valueProvider.useValue);
}
```

### `isFactoryProvider<T>(obj: unknown): obj is FactoryProvider<T>`

Checks if a value is a factory provider.

```tsx
import { isFactoryProvider } from 'nexusdi-core';

const factoryProvider = {
  useFactory: container => new UserService(),
};

if (isFactoryProvider(factoryProvider)) {
  console.log('This is a factory provider');
  console.log('Factory function:', factoryProvider.useFactory);
}
```

## 📋 Module Guards

### `isModuleConfig(obj: unknown): obj is ModuleConfig`

Checks if a value is a module configuration.

```tsx
import { isModuleConfig } from 'nexusdi-core';

const moduleConfig = {
  providers: [UserService, UserRepository],
  exports: [UserService],
  imports: [DatabaseModule],
};

if (isModuleConfig(moduleConfig)) {
  console.log('This is a module configuration');
  console.log('Providers:', moduleConfig.providers);
  console.log('Exports:', moduleConfig.exports);
  console.log('Imports:', moduleConfig.imports);
}
```

### `isModuleClass(obj: unknown): obj is Constructor`

Checks if a value is a module class.

```tsx
import { isModuleClass } from 'nexusdi-core';

@Module({
  providers: [UserService],
})
class UserModule {}

if (isModuleClass(UserModule)) {
  console.log('UserModule is a module class');
}
```

## 🔧 Utility Guards

### `isPromise<T>(obj: unknown): obj is Promise<T>`

Checks if a value is a Promise.

```tsx
import { isPromise } from 'nexusdi-core';

const promise = Promise.resolve('value');

if (isPromise(promise)) {
  console.log('This is a Promise');
}

const notAPromise = 'not a promise';

if (isPromise(notAPromise)) {
  console.log('This will not execute');
}
```

### `isService<T>(obj: unknown): obj is Constructor<T>`

Checks if a value is a service class (has @Service decorator).

```tsx
import { isService } from 'nexusdi-core';

@Service()
class UserService {}

if (isService(UserService)) {
  console.log('UserService is a service class');
}

class NotAService {}

if (isService(NotAService)) {
  console.log('This will not execute');
}
```

## 🎯 Real-World Examples

### Service Registration Validation

```tsx
import { isConstructor, isProvider, isTokenType } from 'nexusdi-core';

function registerService(token: unknown, provider: unknown) {
  // Validate token
  if (!isTokenType(token)) {
    throw new Error('Invalid token type');
  }

  // Validate provider
  if (isConstructor(provider)) {
    // Register class provider
    container.set(token, () => new provider());
  } else if (isProvider(provider)) {
    // Register provider configuration
    container.set(token, provider);
  } else {
    throw new Error('Invalid provider type');
  }
}

// Usage
registerService('userService', UserService); // ✅ Valid
registerService('userService', { useClass: UserService }); // ✅ Valid
registerService('userService', 'invalid'); // ❌ Throws error
```

### Dynamic Module Validation

```tsx
import { isModuleConfig, isModuleClass } from 'nexusdi-core';

function registerModule(module: unknown) {
  if (isModuleClass(module)) {
    // Register module class
    container.set(module, () => new module());
  } else if (isModuleConfig(module)) {
    // Register module configuration
    container.set('dynamicModule', () => module);
  } else {
    throw new Error('Invalid module type');
  }
}

// Usage
@Module({ providers: [UserService] })
class UserModule {}

registerModule(UserModule); // ✅ Valid
registerModule({ providers: [UserService] }); // ✅ Valid
registerModule('invalid'); // ❌ Throws error
```

### Provider Type Detection

```tsx
import {
  isClassProvider,
  isValueProvider,
  isFactoryProvider,
} from 'nexusdi-core';

function processProvider(provider: unknown) {
  if (isClassProvider(provider)) {
    console.log('Processing class provider:', provider.useClass.name);
    return new provider.useClass();
  } else if (isValueProvider(provider)) {
    console.log('Processing value provider:', provider.useValue);
    return provider.useValue;
  } else if (isFactoryProvider(provider)) {
    console.log('Processing factory provider');
    return provider.useFactory(container);
  } else {
    throw new Error('Unknown provider type');
  }
}
```

### Error Handling with Guards

```tsx
import { isTokenType, isConstructor, isProvider } from 'nexusdi-core';

function safeRegisterService(token: unknown, provider: unknown) {
  try {
    // Validate token
    if (!isTokenType(token)) {
      throw new Error(`Invalid token: ${typeof token}`);
    }

    // Validate provider
    if (isConstructor(provider)) {
      container.set(token, () => new provider());
      console.log('Registered class provider');
    } else if (isProvider(provider)) {
      container.set(token, provider);
      console.log('Registered provider configuration');
    } else {
      throw new Error(`Invalid provider: ${typeof provider}`);
    }
  } catch (error) {
    console.error('Registration failed:', error.message);
    // Handle error gracefully
  }
}
```

## 🔧 Best Practices

### 1. Use Guards for Runtime Validation

```tsx
// ✅ Good - Runtime validation
function registerService(token: unknown, provider: unknown) {
  if (!isTokenType(token)) {
    throw new Error('Invalid token');
  }

  if (!isConstructor(provider) && !isProvider(provider)) {
    throw new Error('Invalid provider');
  }

  container.set(token, provider);
}

// ❌ Bad - No validation
function registerService(token: any, provider: any) {
  container.set(token, provider); // Could fail at runtime
}
```

### 2. Use Type Guards for Type Narrowing

```tsx
// ✅ Good - Type narrowing
function processProvider(provider: unknown) {
  if (isClassProvider(provider)) {
    // TypeScript knows provider is ClassProvider
    return new provider.useClass();
  } else if (isValueProvider(provider)) {
    // TypeScript knows provider is ValueProvider
    return provider.useValue;
  }
}

// ❌ Bad - No type narrowing
function processProvider(provider: any) {
  if (provider.useClass) {
    return new provider.useClass(); // TypeScript doesn't know the type
  }
}
```

### 3. Combine Guards for Complex Validation

```tsx
// ✅ Good - Complex validation
function validateModuleConfig(config: unknown) {
  if (!isModuleConfig(config)) {
    throw new Error('Invalid module configuration');
  }

  // Validate providers
  if (config.providers) {
    for (const provider of config.providers) {
      if (!isConstructor(provider) && !isProvider(provider)) {
        throw new Error('Invalid provider in module');
      }
    }
  }

  // Validate exports
  if (config.exports) {
    for (const export_ of config.exports) {
      if (!isTokenType(export_)) {
        throw new Error('Invalid export token');
      }
    }
  }
}
```

### 4. Use Guards in Error Messages

```tsx
// ✅ Good - Descriptive error messages
function registerService(token: unknown, provider: unknown) {
  if (!isTokenType(token)) {
    throw new Error(`Expected token type, got ${typeof token}`);
  }

  if (!isConstructor(provider) && !isProvider(provider)) {
    throw new Error(`Expected constructor or provider, got ${typeof provider}`);
  }
}
```

## 🔍 Troubleshooting

### Common Issues

**Guard not working:**

```tsx
// Make sure to import the guard function
import { isTokenType } from 'nexusdi-core';

// Use the guard correctly
if (isTokenType(token)) {
  // TypeScript now knows token is TokenType
}
```

**Type narrowing not working:**

```tsx
// Make sure to use the guard in an if statement
if (isClassProvider(provider)) {
  // TypeScript knows provider is ClassProvider here
  console.log(provider.useClass);
}

// This won't work for type narrowing
const isClass = isClassProvider(provider);
if (isClass) {
  // TypeScript doesn't know the type here
}
```

**Guard returning false unexpectedly:**

```tsx
// Check the value you're testing
console.log('Value:', value);
console.log('Type:', typeof value);

// Use the appropriate guard
if (isTokenType(value)) {
  console.log('Value is a token type');
}
```

## 🎯 Next Steps

Ready to explore more guard features?

- **[Container Methods](/docs/api-reference/container)** - Learn about container operations
- **[Decorators](/docs/api-reference/decorators)** - Master service decorators
- **[Dynamic Modules](/docs/api-reference/dynamic-module)** - Use guards with dynamic modules
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with guards?** Check out the [Container Methods](/docs/api-reference/container) reference for how to use guards with the container! 🚀
