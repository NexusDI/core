---
sidebar_position: 1
---

# Advanced Usage

NexusDI supports advanced dependency injection patterns for large and complex applications.

## Custom Tokens

You can use the `Token` class to create custom tokens with optional string identifiers:

```typescript
import { Token } from '@nexusdi/core';

const CONFIG_TOKEN = new Token('CONFIG');
const API_URL = 'API_URL';

@Provider(CONFIG_TOKEN)
class ConfigService {
  constructor(@Inject(API_URL) private apiUrl: string) {}
  getApiUrl() { return this.apiUrl; }
}

nexus.set(API_URL, { useValue: 'https://api.example.com' });
nexus.set(CONFIG_TOKEN, { useClass: ConfigService });
```

## Auto-Generated Tokens

You can also create tokens with auto-generated unique identifiers by not passing any parameter:

```typescript
const autoToken = new Token();
nexus.set(autoToken, { useValue: 'some-value' });
```

## Factory Providers

```typescript
nexus.set('FACTORY_TOKEN', {
  useFactory: () => new Date(),
});
```