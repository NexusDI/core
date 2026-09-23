---
sidebar_position: 2
title: 'TypeScript Setup'
description: 'Learn how to configure TypeScript for NexusDI. Get your development environment set up correctly for optimal performance and type safety.'
tags: ['typescript', 'setup', 'configuration', 'decorators', 'native']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# ⚙️ TypeScript Setup

Welcome to the TypeScript setup guide for NexusDI! Just as a Jedi must properly calibrate their lightsaber, you must configure TypeScript correctly to wield the full power of NexusDI. This guide will ensure your development environment is perfectly tuned for maximum performance and type safety.

## 🎯 Why TypeScript Configuration Matters

Proper TypeScript configuration is crucial for:

- **Native Decorators** - Use modern decorator syntax
- **Type Safety** - Full IntelliSense and error checking
- **Performance** - Faster compilation and better tree shaking
- **Future-Proof** - Compatible with latest TypeScript features
- **Developer Experience** - Better IDE support and debugging

## 🚀 Basic Configuration

### Minimum Required Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}
```

**Key Points:**

- `target: "ES2022"` - Required for native decorators
- `experimentalDecorators: false` - We use native decorators
- `emitDecoratorMetadata: false` - Not needed with native decorators
- `useDefineForClassFields: true` - Required for proper field initialization

### Complete Recommended Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "removeComments": false,
    "noEmit": false,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

## 🔧 Framework-Specific Configurations

### React Applications

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "strict": true,
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}
```

### Node.js Applications

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "CommonJS",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true,
    "types": ["node"]
  }
}
```

### Next.js Applications

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Vite Applications

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 🎭 Decorator Configuration

### Native Decorators (Recommended)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}
```

**Benefits:**

- Better performance
- Smaller bundle size
- Future-proof
- No experimental flags

**Usage:**

```tsx
import { Service, Inject } from 'nexusdi-core';

@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;

  constructor() {
    // Fields are properly initialized
  }
}
```

### Legacy Experimental Decorators (Not Recommended)

```json
{
  "compilerOptions": {
    "target": "ES5",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false
  }
}
```

**Issues:**

- Runtime overhead
- Larger bundle size
- Deprecated approach
- Performance impact

## 🏗️ Project Structure

### Recommended Project Layout

```
src/
├── services/
│   ├── UserService.ts
│   ├── OrderService.ts
│   └── PaymentService.ts
├── repositories/
│   ├── UserRepository.ts
│   ├── OrderRepository.ts
│   └── PaymentRepository.ts
├── modules/
│   ├── UserModule.ts
│   ├── OrderModule.ts
│   └── PaymentModule.ts
├── types/
│   ├── User.ts
│   ├── Order.ts
│   └── Payment.ts
├── config/
│   ├── database.ts
│   └── app.ts
├── utils/
│   ├── logger.ts
│   └── validator.ts
└── index.ts
```

### TypeScript Configuration Files

```
project-root/
├── tsconfig.json          # Main configuration
├── tsconfig.build.json    # Build-specific configuration
├── tsconfig.test.json     # Test-specific configuration
└── tsconfig.strict.json   # Strict mode configuration
```

## 🔧 Build-Specific Configurations

### Development Configuration

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "sourceMap": true,
    "declarationMap": true,
    "removeComments": false,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Production Configuration

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "sourceMap": false,
    "declarationMap": false,
    "removeComments": true,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

### Test Configuration

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["jest", "node"]
  },
  "include": ["src/**/*", "tests/**/*", "**/*.test.ts", "**/*.spec.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## 🎯 IDE Configuration

### VS Code Settings

```json
{
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.completeFunctionCalls": true,
  "typescript.suggest.includeAutomaticOptionalChainCompletions": true,
  "typescript.suggest.includeCompletionsForImportStatements": true,
  "typescript.suggest.includeCompletionsWithSnippetText": true,
  "typescript.suggest.includeCompletionsWithClassMemberSnippets": true,
  "typescript.suggest.includeCompletionsWithObjectLiteralMethodSnippets": true,
  "typescript.suggest.includeCompletionsWithInsertText": true,
  "typescript.suggest.includeCompletionsForModuleExports": true,
  "typescript.suggest.includeCompletionsWithReplaceText": true,
  "typescript.suggest.includeCompletionsWithInsertText": true,
  "typescript.suggest.includeCompletionsForImportStatements": true,
  "typescript.suggest.includeCompletionsWithSnippetText": true,
  "typescript.suggest.includeCompletionsWithClassMemberSnippets": true,
  "typescript.suggest.includeCompletionsWithObjectLiteralMethodSnippets": true,
  "typescript.suggest.includeCompletionsWithInsertText": true,
  "typescript.suggest.includeCompletionsForModuleExports": true,
  "typescript.suggest.includeCompletionsWithReplaceText": true
}
```

### VS Code Extensions

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "ms-vscode.vscode-json"
  ]
}
```

## 🔍 Troubleshooting

### Common Issues

**Decorators not working:**

```json
// Check your tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}
```

**Field initialization issues:**

```json
// Make sure useDefineForClassFields is true
{
  "compilerOptions": {
    "useDefineForClassFields": true
  }
}
```

**Type errors:**

```tsx
// Use proper imports
import { Service, Inject, Module } from 'nexusdi-core';

// Not
import { service, inject, module } from 'nexusdi-core';
```

**Module resolution issues:**

```json
// Check moduleResolution
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### Performance Issues

**Slow compilation:**

```json
// Use incremental compilation
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

**Large bundle size:**

```json
// Enable tree shaking
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "node"
  }
}
```

## 🎯 Best Practices

### 1. Use Strict Mode

```json
// ✅ Good - Strict mode enabled
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true
  }
}
```

### 2. Enable Source Maps

```json
// ✅ Good - Source maps for debugging
{
  "compilerOptions": {
    "sourceMap": true,
    "declarationMap": true
  }
}
```

### 3. Use Native Decorators

```json
// ✅ Good - Native decorators
{
  "compilerOptions": {
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}
```

### 4. Optimize for Production

```json
// ✅ Good - Production optimizations
{
  "compilerOptions": {
    "removeComments": true,
    "sourceMap": false,
    "declarationMap": false
  }
}
```

## 🚀 Next Steps

Ready to start building with NexusDI?

- **[Getting Started](/docs/getting-started)** - Learn the basics
- **[Core Concepts](/docs/concepts)** - Understand dependency injection
- **[API Reference](/docs/api-reference)** - Explore the full API
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with TypeScript setup?** Check out [Getting Started](/docs/getting-started) to begin your NexusDI journey! 🚀
