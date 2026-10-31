'use client';

import { type ComponentType, useEffect, useState } from 'react';

/**
 * The copy button of the install line, loaded with `import()` once the page
 * has hydrated. A copy needs script, so the server renders an empty slot and
 * the button appears in it; a failed load (a deploy replaced the chunk) leaves
 * the slot empty, as it is with JavaScript off. The shell is the only code the
 * route holds for it, and `CopyButton.tsx` stays out of every other page.
 */
export default function CopyIsland({ text }: { text: string }) {
  const [Button, setButton] = useState<ComponentType<{ text: string }> | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    import('./CopyButton').then(
      (loaded) => {
        if (live) setButton(() => loaded.default);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <span className="nexus-install__slot">
      {Button ? <Button text={text} /> : null}
    </span>
  );
}
