# Modules in Loom DI

Modules in **Loom** provide a way to organize and compose your dependency injection configuration. They allow you to group related providers, manage dependencies between different parts of your application, and control what gets exported to other modules.

## 🏗️ **Module Concepts**

### **What is a Module?**

A module is a class that:

- Groups related providers (services, configurations, etc.)
- Declares dependencies on other modules (imports)
- Exposes specific providers for other modules to use (exports)
- Has its own lifecycle (onStart, onStop, onDispose)

### **Key Features**

- ✅ **Composition** - Modules can import other modules
- ✅ **Encapsulation** - Only exported providers are available to other modules
- ✅ **Lifecycle Management** - Modules start/stop in dependency order
- ✅ **Duplicate Prevention** - Same module registered multiple times is handled gracefully
- ✅ **Dependency Resolution** - Automatic dependency graph resolution

---

## 📋 **Module Configuration**

### **Module Metadata Structure**

```typescript
interface ModuleConfig {
  providers?: ModuleProvider[]; // Services/providers this module provides
  imports?: Constructor[]; // Other modules this module depends on
  exports?: TokenType[]; // Tokens to make available to other modules
}
```

### **Setting Module Metadata**

You can set module metadata in two ways:

#### **1. Using @Module Decorator** (Recommended)

```typescript
@Module({
  providers: [UserService, LoggerService],
  imports: [DatabaseModule],
  exports: [USER_SERVICE_TOKEN],
})
export class UserModule extends BaseModule {}
```

#### **2. Using setModuleMetadata** (Manual)

```typescript
import { setModuleMetadata } from 'loom';

class UserModule extends BaseModule {}

setModuleMetadata(UserModule, {
  providers: [UserService, LoggerService],
  imports: [DatabaseModule],
  exports: [USER_SERVICE_TOKEN],
});
```

---

## 🔧 **Creating Modules**

### **Basic Module Example**

```typescript
import { Token, Module, BaseModule } from 'loom';

// Define tokens
const LOGGER = new Token<ILogger>('logger');
const CONFIG = new Token<IConfig>('config');

// Define services
class LoggerService implements ILogger {
  log(message: string) {
    console.log(`[LOG] ${message}`);
  }
}

// Create module
@Module({
  providers: [
    { token: LOGGER, useClass: LoggerService },
    { token: CONFIG, useValue: { appName: 'MyApp' } },
  ],
  exports: [LOGGER, CONFIG], // Make these available to other modules
})
export class CoreModule extends BaseModule {
  async onStart() {
    console.log('Core module started');
  }
}
```

### **Module with Dependencies**

```typescript
@Module({
  imports: [CoreModule], // Import the core module
  providers: [
    {
      token: USER_SERVICE,
      useFactory: (logger, config) => new UserService(logger, config),
      deps: [LOGGER, CONFIG], // Dependencies from imported modules
    },
  ],
  exports: [USER_SERVICE],
})
export class UserModule extends BaseModule {}
```

---

## 🏛️ **Module Architecture Patterns**

### **1. Core Module Pattern**

Create a core module with shared services:

```typescript
@Module({
  providers: [
    { token: LOGGER, useClass: LoggerService },
    { token: DATABASE, useClass: DatabaseService },
    { token: CONFIG, useValue: appConfig },
  ],
  exports: [LOGGER, DATABASE, CONFIG],
})
export class CoreModule extends BaseModule {}
```

### **2. Feature Module Pattern**

Create feature-specific modules:

```typescript
@Module({
  imports: [CoreModule],
  providers: [
    { token: USER_SERVICE, useClass: UserService },
    { token: USER_REPOSITORY, useClass: UserRepository },
  ],
  exports: [USER_SERVICE],
})
export class UserModule extends BaseModule {}

@Module({
  imports: [CoreModule, UserModule],
  providers: [{ token: AUTH_SERVICE, useClass: AuthService }],
  exports: [AUTH_SERVICE],
})
export class AuthModule extends BaseModule {}
```

### **3. Application Module Pattern**

Create a root module that composes everything:

```typescript
@Module({
  imports: [CoreModule, UserModule, AuthModule],
  providers: [
    // Application-specific providers
  ],
})
export class AppModule extends BaseModule {}
```

---

## 🚀 **Using Modules**

### **Registration**

```typescript
const container = new Container();

// Register the root module (cascades to import all dependencies)
container.register(AppModule);

// Or register modules explicitly
container.registerModule(CoreModule);
container.registerModule(UserModule);
```

### **Lifecycle Management**

```typescript
// Start all modules (in dependency order)
await container.onStart();

// Use services
const userService = await container.resolve(USER_SERVICE);
const user = await userService.getUser('123');

// Stop all modules (in reverse order)
await container.onStop();
```

### **Complete Example**

```typescript
// Start application
const container = new Container();
container.register(AppModule);

await container.onStart();
console.log('✅ Application started');

// Use services
const logger = await container.resolve(LOGGER);
const userService = await container.resolve(USER_SERVICE);

logger.log('Application is running');
const user = await userService.getUser('123');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⏹️  Shutting down...');
  await container.onStop();
  await container.onDispose();
  process.exit(0);
});
```

---

## ⚡ **Advanced Module Features**

### **Module Lifecycle Order**

- **Start**: Modules start in dependency order (dependencies first)
- **Stop**: Modules stop in reverse dependency order (dependents first)
- **Dispose**: Same as stop, but includes cleanup

### **Circular Dependency Prevention**

The module system automatically detects and prevents circular dependencies:

```typescript
// ❌ This would be detected and prevented
@Module({ imports: [ModuleB] })
class ModuleA {}

@Module({ imports: [ModuleA] })
class ModuleB {}
```

### **Lazy Module Loading**

Modules are only instantiated when resolved, enabling lazy loading:

```typescript
// Module instance created only when needed
const moduleInstance = await container.resolve(
  generateTokenFromClass(UserModule)
);
```

### **Dynamic Module Configuration**

```typescript
class ConfigurableModule extends BaseModule {
  static forRoot(config: any): Constructor {
    class DynamicModule extends BaseModule {}

    setModuleMetadata(DynamicModule, {
      providers: [{ token: CONFIG_TOKEN, useValue: config }],
      exports: [CONFIG_TOKEN],
    });

    return DynamicModule;
  }
}

// Usage
container.register(
  ConfigurableModule.forRoot({ apiUrl: 'https://api.example.com' })
);
```

---

## 🎯 **Best Practices**

### **1. Module Organization**

- Group related functionality in modules
- Keep modules focused and cohesive
- Use clear naming conventions

### **2. Dependency Management**

- Minimize inter-module dependencies
- Use imports/exports to control visibility
- Avoid circular dependencies

### **3. Lifecycle Management**

- Implement proper startup/shutdown in modules
- Handle errors gracefully in lifecycle methods
- Clean up resources in onDispose

### **4. Testing**

- Test modules in isolation
- Mock imported dependencies
- Test module composition

---

## 🔍 **Module System Benefits**

1. **🏗️ Modularity** - Clean separation of concerns
2. **🔧 Composability** - Easy to combine and reuse modules
3. **📦 Encapsulation** - Control what's exposed via exports
4. **⚡ Performance** - Lazy loading and efficient resolution
5. **🛡️ Safety** - Circular dependency detection
6. **📈 Scalability** - Organize large applications effectively
7. **🧪 Testability** - Easy to test modules independently

The module system in Loom provides a powerful way to structure your dependency injection while maintaining clarity, performance, and maintainability.
