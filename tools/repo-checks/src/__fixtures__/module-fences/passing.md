# Passing

```ts @import.meta.vitest @module
import { test } from 'vitest';

const heading = (to: string) => to.length;

test('claims the right heading', () => {
  heading('Kepler'); // -> 6
});
```
