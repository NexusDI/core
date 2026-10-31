'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;

/**
 * The copy button of the install line. It renders hidden until it has hydrated,
 * since a copy needs script, and the label says what happened. `InstallLine`
 * loads this file with `import()` on use, so no other page carries it.
 */
export default function CopyButton({ text }: { text: string }) {
  // False on the server and during hydration, true once the browser has a clipboard.
  const ready = useSyncExternalStore(
    noSubscription,
    () => !!navigator.clipboard,
    () => false,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <button
        type="button"
        className="nexus-install__copy"
        hidden={!ready}
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
