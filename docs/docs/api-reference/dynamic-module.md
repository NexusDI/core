---
sidebar_position: 4
title: 'Dynamic Modules'
description: 'Learn how to create and configure dynamic modules at runtime with NexusDI. Master the art of flexible module configuration.'
tags: ['dynamic-modules', 'api', 'reference', 'runtime', 'configuration']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🔄 Dynamic Modules

Dynamic modules are the secret weapon of NexusDI - they allow you to create and configure modules at runtime, giving you the flexibility to adapt your application to different environments, configurations, and requirements. Think of them as the shape-shifting abilities of a Jedi - they can transform to meet any situation.

## 🎯 What are Dynamic Modules?

Dynamic modules are modules that can be configured at runtime rather than compile time. They're perfect for:

- Environment-specific configurations
- Feature flags and conditional loading
- Plugin systems
- A/B testing scenarios
- Runtime configuration changes

## 🏗️ Basic Dynamic Module

### Using `createModuleConfig`

The simplest way to create a dynamic module is using the `createModuleConfig` function:

```tsx
import { createModuleConfig } from 'nexusdi-core';

const moduleConfig = createModuleConfig({
  providers: [UserService, UserRepository],
  exports: [UserService],
});

// Register the dynamic module
container.set('userModule', () => moduleConfig);
```

### With Imports

```tsx
const moduleConfig = createModuleConfig({
  providers: [UserService, UserRepository],
  imports: [DatabaseModule],
  exports: [UserService],
});
```

## 🔧 Advanced Dynamic Module Patterns

### Environment-Specific Modules

```tsx
import { createModuleConfig } from 'nexusdi-core';

// Development module
const devModule = createModuleConfig({
  providers: [MockUserService, MockDatabaseService],
  exports: [MockUserService],
});

// Production module
const prodModule = createModuleConfig({
  providers: [UserService, DatabaseService],
  imports: [DatabaseModule],
  exports: [UserService],
});

// Choose module based on environment
const moduleConfig =
  process.env.NODE_ENV === 'production' ? prodModule : devModule;
container.set('userModule', () => moduleConfig);
```

### Feature Flag Modules

```tsx
import { createModuleConfig } from 'nexusdi-core';

function createUserModule(features: {
  useCache: boolean;
  useMetrics: boolean;
}) {
  const providers = [UserService, UserRepository];

  if (features.useCache) {
    providers.push(CacheService);
  }

  if (features.useMetrics) {
    providers.push(MetricsService);
  }

  return createModuleConfig({
    providers,
    exports: [UserService],
  });
}

// Create module with feature flags
const moduleConfig = createUserModule({
  useCache: true,
  useMetrics: false,
});

container.set('userModule', () => moduleConfig);
```

### Configuration-Driven Modules

```tsx
import { createModuleConfig } from 'nexusdi-core';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  ssl: boolean;
}

function createDatabaseModule(config: DatabaseConfig) {
  return createModuleConfig({
    providers: [
      {
        token: 'databaseConfig',
        useValue: config,
      },
      {
        token: 'databaseService',
        useFactory: container => {
          const dbConfig = container.get('databaseConfig');
          return new DatabaseService(dbConfig);
        },
      },
    ],
    exports: ['databaseService'],
  });
}

// Create module with configuration
const moduleConfig = createDatabaseModule({
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  ssl: false,
});

container.set('databaseModule', () => moduleConfig);
```

## 🎭 Dynamic Module Interface

### Implementing DynamicModule

For more complex scenarios, you can implement the `DynamicModule` interface:

```tsx
import { DynamicModule, createModuleConfig } from 'nexusdi-core';

const DATABASE_CONFIG_TOKEN = Symbol('DatabaseConfig');

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
}

@Module({})
class DatabaseModule implements DynamicModule<DatabaseConfig> {
  configToken = DATABASE_CONFIG_TOKEN;

  static async config(config: DatabaseConfig | Promise<DatabaseConfig>) {
    return await createModuleConfig(new this(), config);
  }
}

// Use the dynamic module
const config = await DatabaseModule.config({
  host: 'localhost',
  port: 5432,
  database: 'myapp',
});

container.set('databaseModule', () => config);
```

### Async Configuration

Dynamic modules support async configuration for complex setup scenarios:

```tsx
import { createModuleConfig } from 'nexusdi-core';

async function createAsyncModule() {
  // Load configuration from external source
  const config = await loadConfigFromAPI();

  // Create module based on configuration
  return createModuleConfig({
    providers: [
      {
        token: 'apiConfig',
        useValue: config,
      },
      {
        token: 'apiService',
        useFactory: container => {
          const apiConfig = container.get('apiConfig');
          return new ApiService(apiConfig);
        },
      },
    ],
    exports: ['apiService'],
  });
}

// Register async module
const moduleConfig = await createAsyncModule();
container.set('apiModule', () => moduleConfig);
```

## 🏢 Real-World Examples

### Multi-Tenant Module System

```tsx
import { createModuleConfig } from 'nexusdi-core';

interface TenantConfig {
  tenantId: string;
  databaseUrl: string;
  features: string[];
}

function createTenantModule(tenantConfig: TenantConfig) {
  const providers = [
    {
      token: 'tenantConfig',
      useValue: tenantConfig,
    },
    {
      token: 'tenantDatabase',
      useFactory: container => {
        const config = container.get('tenantConfig');
        return new DatabaseService(config.databaseUrl);
      },
    },
    UserService,
    UserRepository,
  ];

  // Add feature-specific services
  if (tenantConfig.features.includes('analytics')) {
    providers.push(AnalyticsService);
  }

  if (tenantConfig.features.includes('notifications')) {
    providers.push(NotificationService);
  }

  return createModuleConfig({
    providers,
    exports: [UserService],
  });
}

// Create modules for different tenants
const tenant1Module = createTenantModule({
  tenantId: 'tenant1',
  databaseUrl: 'postgres://tenant1.db.com/mydb',
  features: ['analytics', 'notifications'],
});

const tenant2Module = createTenantModule({
  tenantId: 'tenant2',
  databaseUrl: 'postgres://tenant2.db.com/mydb',
  features: ['analytics'],
});

// Register tenant modules
container.set('tenant1Module', () => tenant1Module);
container.set('tenant2Module', () => tenant2Module);
```

### Plugin System

```tsx
import { createModuleConfig } from 'nexusdi-core';

interface Plugin {
  name: string;
  providers: any[];
  dependencies?: string[];
}

class PluginManager {
  private plugins = new Map<string, Plugin>();

  registerPlugin(plugin: Plugin) {
    this.plugins.set(plugin.name, plugin);
  }

  createModuleConfig(pluginNames: string[]) {
    const providers = [];
    const processedPlugins = new Set<string>();

    // Process plugins in dependency order
    const processPlugin = (pluginName: string) => {
      if (processedPlugins.has(pluginName)) return;

      const plugin = this.plugins.get(pluginName);
      if (!plugin) throw new Error(`Plugin ${pluginName} not found`);

      // Process dependencies first
      if (plugin.dependencies) {
        plugin.dependencies.forEach(processPlugin);
      }

      providers.push(...plugin.providers);
      processedPlugins.add(pluginName);
    };

    pluginNames.forEach(processPlugin);

    return createModuleConfig({
      providers,
      exports: providers.filter(p => p.export !== false),
    });
  }
}

// Register plugins
const pluginManager = new PluginManager();

pluginManager.registerPlugin({
  name: 'user',
  providers: [UserService, UserRepository],
});

pluginManager.registerPlugin({
  name: 'email',
  providers: [EmailService, SMTPConfig],
});

pluginManager.registerPlugin({
  name: 'analytics',
  providers: [AnalyticsService],
  dependencies: ['user'],
});

// Create module with specific plugins
const moduleConfig = pluginManager.createModuleConfig([
  'user',
  'email',
  'analytics',
]);
container.set('appModule', () => moduleConfig);
```

### A/B Testing Module

```tsx
import { createModuleConfig } from 'nexusdi-core';

interface ABTestConfig {
  variant: 'A' | 'B';
  features: {
    useNewUI: boolean;
    useNewAlgorithm: boolean;
    useNewDatabase: boolean;
  };
}

function createABTestModule(config: ABTestConfig) {
  const providers = [UserService];

  if (config.features.useNewUI) {
    providers.push(NewUIService);
  } else {
    providers.push(LegacyUIService);
  }

  if (config.features.useNewAlgorithm) {
    providers.push(NewAlgorithmService);
  } else {
    providers.push(LegacyAlgorithmService);
  }

  if (config.features.useNewDatabase) {
    providers.push(NewDatabaseService);
  } else {
    providers.push(LegacyDatabaseService);
  }

  return createModuleConfig({
    providers,
    exports: [UserService],
  });
}

// Create modules for different variants
const variantAModule = createABTestModule({
  variant: 'A',
  features: {
    useNewUI: false,
    useNewAlgorithm: true,
    useNewDatabase: false,
  },
});

const variantBModule = createABTestModule({
  variant: 'B',
  features: {
    useNewUI: true,
    useNewAlgorithm: true,
    useNewDatabase: true,
  },
});

// Register based on user's variant
const userVariant = getUserVariant(); // Some logic to determine variant
const moduleConfig = userVariant === 'A' ? variantAModule : variantBModule;
container.set('appModule', () => moduleConfig);
```

## 🔧 Best Practices

### 1. Use TypeScript for Type Safety

```tsx
// ✅ Good - Type-safe configuration
interface ModuleConfig {
  databaseUrl: string;
  features: string[];
}

function createModule(config: ModuleConfig) {
  return createModuleConfig({
    providers: [
      {
        token: 'config',
        useValue: config,
      },
    ],
  });
}

// ❌ Bad - No type safety
function createModule(config: any) {
  return createModuleConfig({
    providers: [
      {
        token: 'config',
        useValue: config,
      },
    ],
  });
}
```

### 2. Validate Configuration

```tsx
// ✅ Good - Validate configuration
function createModule(config: ModuleConfig) {
  if (!config.databaseUrl) {
    throw new Error('Database URL is required');
  }

  if (!Array.isArray(config.features)) {
    throw new Error('Features must be an array');
  }

  return createModuleConfig({
    providers: [
      {
        token: 'config',
        useValue: config,
      },
    ],
  });
}
```

### 3. Use Factory Functions for Complex Logic

```tsx
// ✅ Good - Factory function for complex logic
function createModuleFactory(environment: string) {
  return (config: any) => {
    const baseProviders = [UserService, UserRepository];

    if (environment === 'production') {
      baseProviders.push(ProductionDatabaseService);
    } else {
      baseProviders.push(MockDatabaseService);
    }

    return createModuleConfig({
      providers: baseProviders,
      exports: [UserService],
    });
  };
}

const createProdModule = createModuleFactory('production');
const createDevModule = createModuleFactory('development');
```

### 4. Handle Async Configuration

```tsx
// ✅ Good - Handle async configuration
async function createAsyncModule() {
  try {
    const config = await loadConfigFromAPI();
    return createModuleConfig({
      providers: [
        {
          token: 'config',
          useValue: config,
        },
      ],
    });
  } catch (error) {
    // Fallback to default configuration
    return createModuleConfig({
      providers: [
        {
          token: 'config',
          useValue: getDefaultConfig(),
        },
      ],
    });
  }
}
```

## 🔍 Troubleshooting

### Common Issues

**Configuration not loading:**

```tsx
// Make sure to await async configuration
const moduleConfig = await createAsyncModule();
container.set('module', () => moduleConfig);
```

**Circular dependencies:**

```tsx
// Use dependency arrays to specify order
const moduleConfig = createModuleConfig({
  providers: [ServiceA, ServiceB, ServiceC],
  // ServiceA depends on ServiceB, ServiceB depends on ServiceC
  // Order matters: ServiceC, ServiceB, ServiceA
});
```

**Type errors:**

```tsx
// Use proper typing for configuration
interface Config {
  databaseUrl: string;
  features: string[];
}

function createModule(config: Config) {
  // TypeScript will catch type errors
  return createModuleConfig({
    providers: [
      {
        token: 'config',
        useValue: config,
      },
    ],
  });
}
```

## 🎯 Next Steps

Ready to explore more dynamic module features?

- **[Container Methods](/docs/api-reference/container)** - Learn about container operations
- **[Decorators](/docs/api-reference/decorators)** - Master service decorators
- **[Guards](/docs/api-reference/guards)** - Use type checking utilities
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with dynamic modules?** Check out the [Container Methods](/docs/api-reference/container) reference for how to use dynamic modules with the container! 🚀
