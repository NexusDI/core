---
sidebar_position: 5
title: 'Bundle Optimization & Tree Shaking'
description: 'Master bundle optimization and tree shaking with NexusDI. Learn how to create smaller, more efficient bundles for production.'
tags:
  ['bundle-optimization', 'tree-shaking', 'webpack', 'rollup', 'vite', 'size']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 📦 Bundle Optimization & Tree Shaking

Welcome to the bundle optimization guide for NexusDI! Just as a Jedi must pack efficiently for a mission, you must optimize your bundles for production. This guide will teach you the secrets of creating smaller, faster, and more efficient bundles that load like lightning.

## 🎯 Why Bundle Optimization Matters

Bundle optimization is crucial for:

- **Faster Loading** - Smaller bundles load faster
- **Better Performance** - Less JavaScript to parse and execute
- **Lower Bandwidth** - Reduced data usage for users
- **Better SEO** - Faster sites rank higher
- **Cost Savings** - Less bandwidth costs

## 📊 Bundle Size Analysis

### NexusDI Core Bundle Sizes

```text
// Core bundle sizes (approximate)
import { Nexus } from 'nexusdi-core'; // ~2KB gzipped
import { Service, Inject } from 'nexusdi-core'; // ~1KB gzipped
import { Module } from 'nexusdi-core'; // ~0.5KB gzipped
import { Token } from 'nexusdi-core'; // ~0.3KB gzipped

// Full import
import * as NexusDI from 'nexusdi-core'; // ~5KB gzipped
```

### Tree Shaking Benefits

```text
// ✅ Good - Tree shakeable imports
import { Nexus, Service, Inject } from 'nexusdi-core';

// Only imports what you use
const container = new Nexus();
@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;
}

// ❌ Bad - Imports everything
import * as NexusDI from 'nexusdi-core';

// Imports entire library
const container = new NexusDI.Nexus();
@NexusDI.Service()
class UserService {
  @NexusDI.Inject()
  private userRepo: UserRepository;
}
```

## 🚀 Optimization Techniques

### 1. Selective Imports

```text
// ✅ Good - Import only what you need
import { Nexus, Service, Inject, Module } from 'nexusdi-core';

// ❌ Bad - Import everything
import * as NexusDI from 'nexusdi-core';

// ❌ Bad - Import unused modules
import {
  Nexus,
  Service,
  Inject,
  Module,
  Token,
  Guards,
  Helpers,
} from 'nexusdi-core';
// Only using Nexus, Service, Inject, Module
```

### 2. Dynamic Imports

```text
// ✅ Good - Dynamic imports for code splitting
async function loadUserModule() {
  const { UserModule } = await import('./modules/user/UserModule');
  return new UserModule();
}

// Register dynamic module
container.set('userModule', loadUserModule);

// ❌ Bad - Static imports for everything
import { UserModule } from './modules/user/UserModule';
import { OrderModule } from './modules/order/OrderModule';
import { PaymentModule } from './modules/payment/PaymentModule';
// All modules loaded upfront
```

### 3. Lazy Loading Services

```text
// ✅ Good - Lazy loading for optional services
@Service()
class UserService {
  constructor(@Inject() private userRepo: UserRepository) {}

  async getUser(id: number) {
    // Load analytics service only when needed
    if (this.shouldTrackAnalytics()) {
      const { AnalyticsService } = await import('./AnalyticsService');
      const analytics = new AnalyticsService();
      await analytics.track('user.viewed', { userId: id });
    }

    return await this.userRepo.findById(id);
  }

  private shouldTrackAnalytics(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}

// ❌ Bad - Always loading optional services
import { AnalyticsService } from './AnalyticsService';

@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private analytics: AnalyticsService // Always loaded
  ) {}
}
```

## 🔧 Build Tool Configuration

### Webpack Configuration

```text
// webpack.config.js
const path = require('path');

module.exports = {
  mode: 'production',
  optimization: {
    usedExports: true,
    sideEffects: false,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        nexusdi: {
          test: /[\\/]node_modules[\\/]nexusdi-core[\\/]/,
          name: 'nexusdi',
          chunks: 'all',
        },
      },
    },
  },
  resolve: {
    alias: {
      'nexusdi-core': path.resolve(
        __dirname,
        'node_modules/nexusdi-core/dist/index.js'
      ),
    },
  },
};
```

### Rollup Configuration

```text
// rollup.config.js
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { terser } from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/bundle.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    terser({
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    }),
  ],
  external: ['nexusdi-core'],
};
```

### Vite Configuration

```text
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          nexusdi: ['nexusdi-core'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['nexusdi-core'],
  },
});
```

## 🏗️ Advanced Optimization Patterns

### Module Splitting

```text
// Split modules by feature
// modules/user/index.ts
export { UserModule } from './UserModule';
export { UserService } from './UserService';
export { UserRepository } from './UserRepository';

// modules/order/index.ts
export { OrderModule } from './OrderModule';
export { OrderService } from './OrderService';
export { OrderRepository } from './OrderRepository';

// Main application
import { UserModule } from './modules/user';
import { OrderModule } from './modules/order';

// Only load what you need
const container = new Nexus();
await container.init();

if (features.includes('user-management')) {
  container.set('userModule', () => new UserModule());
}

if (features.includes('order-management')) {
  container.set('orderModule', () => new OrderModule());
}
```

### Conditional Bundling

```text
// Use environment variables for conditional bundling
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Production: Load optimized services
  const { OptimizedUserService } = await import(
    './services/OptimizedUserService'
  );
  container.set('userService', () => new OptimizedUserService());
} else {
  // Development: Load debug services
  const { DebugUserService } = await import('./services/DebugUserService');
  container.set('userService', () => new DebugUserService());
}
```

### Service Lazy Loading

```text
// Lazy load services based on user permissions
class ServiceLoader {
  private loadedServices = new Set<string>();

  async loadService(
    serviceName: string,
    userPermissions: string[]
  ): Promise<any> {
    if (this.loadedServices.has(serviceName)) {
      return container.get(serviceName);
    }

    // Load service based on permissions
    if (userPermissions.includes('admin')) {
      const { AdminService } = await import(`./services/${serviceName}Admin`);
      container.set(serviceName, () => new AdminService());
    } else {
      const { UserService } = await import(`./services/${serviceName}User`);
      container.set(serviceName, () => new UserService());
    }

    this.loadedServices.add(serviceName);
    return container.get(serviceName);
  }
}
```

## 📈 Bundle Analysis Tools

### Webpack Bundle Analyzer

```bash
# Install
npm install --save-dev webpack-bundle-analyzer

# Add to webpack config
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
    }),
  ],
};
```

### Rollup Bundle Analyzer

```bash
# Install
npm install --save-dev rollup-plugin-visualizer

# Add to rollup config
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    visualizer({
      filename: 'bundle-analysis.html',
      open: true,
    }),
  ],
};
```

### Vite Bundle Analyzer

```bash
# Install
npm install --save-dev vite-bundle-analyzer

# Add to vite config
import { analyzer } from 'vite-bundle-analyzer';

export default defineConfig({
  plugins: [
    analyzer({
      analyzerMode: 'static',
      openAnalyzer: false,
    }),
  ],
});
```

## 🎯 Best Practices

### 1. Use Tree Shaking

```text
// ✅ Good - Tree shakeable
import { Nexus, Service, Inject } from 'nexusdi-core';

// ❌ Bad - No tree shaking
import * as NexusDI from 'nexusdi-core';
```

### 2. Minimize Bundle Size

```text
// ✅ Good - Minimal imports
import { Nexus } from 'nexusdi-core';

// ❌ Bad - Unnecessary imports
import {
  Nexus,
  Service,
  Inject,
  Module,
  Token,
  Guards,
  Helpers,
  Types,
} from 'nexusdi-core';
// Only using Nexus
```

### 3. Use Dynamic Imports

```text
// ✅ Good - Dynamic imports
const { UserModule } = await import('./UserModule');

// ❌ Bad - Static imports for everything
import { UserModule } from './UserModule';
import { OrderModule } from './OrderModule';
import { PaymentModule } from './PaymentModule';
```

### 4. Optimize for Production

```text
// ✅ Good - Production optimizations
if (process.env.NODE_ENV === 'production') {
  // Use optimized services
  const { OptimizedService } = await import('./OptimizedService');
  container.set('service', () => new OptimizedService());
} else {
  // Use debug services
  const { DebugService } = await import('./DebugService');
  container.set('service', () => new DebugService());
}
```

## 🔍 Troubleshooting

### Common Bundle Issues

**Large bundle size:**

```text
// Check for unnecessary imports
import {
  Nexus,
  Service,
  Inject,
  Module,
  Token,
  Guards,
  Helpers,
  Types,
} from 'nexusdi-core';
// Only using Nexus, Service, Inject

// Fix: Import only what you need
import { Nexus, Service, Inject } from 'nexusdi-core';
```

**Tree shaking not working:**

```text
// Check package.json
{
  "sideEffects": false,
  "module": "dist/index.js",
  "main": "dist/index.js"
}

// Check webpack config
module.exports = {
  optimization: {
    usedExports: true,
    sideEffects: false,
  },
};
```

**Dynamic imports not working:**

```text
// Check TypeScript config
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext"
  }
}
```

## 🎯 Next Steps

Ready to explore more optimization features?

- **[Performance](performance)** - Master performance optimization
- **[Async Patterns](/docs/advanced/async-patterns)** - Optimize async operations
- **[Resource Cleanup](/docs/advanced/resource-cleanup)** - Optimize resource management
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with bundle optimization?** Check out [Performance](performance) to learn about optimizing your application! 🚀
