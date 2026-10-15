# Failing

```ts @import.meta.vitest @module
import { test } from 'vitest';

const heading = (to: string) => to.length;

test('claims the wrong heading', () => {
  heading('Kepler'); // -> 7
});
```
