'use client';

import { useEffect, useState } from 'react';

/**
 * The copy button of the install line, which `CopyIsland.tsx` loads with
 * `import()` after hydration. It renders nothing without a clipboard, and its
 * label and a status line say what happened.
 */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!navigator.clipboard) return null;

  return (
    <>
      <button
        type="button"
        className="nexus-install__copy"
        onClick={() => {
          navigator.clipboard.writeText(text).then(
            () => setCopied(true),
            () => undefined,
          );
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="nexus-visually-hidden" role="status">
        {copied ? 'Install command copied' : ''}
      </span>
    </>
  );
}
