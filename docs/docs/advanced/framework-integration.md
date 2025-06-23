---
sidebar_position: 6
---

# Framework Integration

Integrate NexusDI with popular frameworks like React, Express, and testing tools for seamless dependency management.

> See also: [Module Patterns](../module-patterns.md), [Testing](../testing.md)

## React Integration (Client-side Example)

This example shows how to use NexusDI for dependency injection on the client side in a React app:

```typescript
import React, { createContext, useContext } from 'react';
import { container } from './container';

const DIContext = createContext(container);
export const useDI = () => useContext(DIContext);

// In your app root
<DIContext.Provider value={container}>
  <App />
</DIContext.Provider>

// In a component
const userService = useDI().get(UserService);
```

> **Note:** In frameworks like React Router 7 (Framework mode), you will often want to separate your client-side DI container from your server-side DI container. Typically, you create a new container instance per request on the server, and a singleton container on the client. The [React Router 7 example](../../examples/react-router/) in the examples folder demonstrates server-side DI container usage; you can adapt this pattern for client-side DI as needed.

---

## Express Middleware (Recommended)

Inject services into Express middleware:

```typescript
app.use((req, res, next) => {
  req.services = container.createChild();
  next();
});

// In a route handler
app.get('/users', (req, res) => {
  const userService = req.services.get(UserService);
  // ...
});
```

---

## Testing Setup (Recommended)

Use child containers for test isolation:

```typescript
beforeEach(() => {
  testContainer = container.createChild();
});

test('...', () => {
  const service = testContainer.get(MyService);
  // ...
});
```

---

## Best Practices
- Use context providers for React.
- Use child containers per request in web frameworks.
- Isolate tests with fresh containers.

---

**Next:** [Performance Tuning](performance-tuning.md) 