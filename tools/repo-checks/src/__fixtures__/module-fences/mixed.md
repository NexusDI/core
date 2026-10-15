# Mixed

```ts @import.meta.vitest @module
import { test } from 'vitest';

test('fails in the module fence', () => {
  'Kepler'.length; // -> 7
});
```

```ts @import.meta.vitest
const course: string = 'Gliese';
course.length; // -> 7
```
