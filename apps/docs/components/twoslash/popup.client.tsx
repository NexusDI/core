'use client';

import { useEffect, useId, useRef, type ComponentProps } from 'react';

/**
 * The client half of a twoslash hover: it links the button to its panel and
 * loads `popup-position.ts` with `import()` on the first pointer or focus that
 * reaches it. Until then `popup.css` shows the panel on hover and focus.
 */
export function PopupRoot({ className, ...props }: ComponentProps<'span'>) {
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const asked = useRef(false);

  useEffect(() => {
    const element = root.current;
    const button = element?.querySelector(':scope > .nexus-popup__button');
    const panel = element?.querySelector(':scope > .nexus-popup__panel');
    if (!button || !panel) return;
    panel.id = `${id}-type`;
    panel.setAttribute('role', 'tooltip');
    button.setAttribute('aria-describedby', panel.id);
  }, [id]);

  const reach = (event: { type: string }) => {
    const element = root.current;
    if (asked.current || !element) return;
    asked.current = true;
    const opening = event.type;
    void import('./popup-position').then(
      ({ attach }) => attach(element, opening),
      // A chunk a deploy replaced stays on the CSS hover, which still works.
      () => undefined,
    );
  };

  return (
    <span
      ref={root}
      className={['nexus-popup', className].filter(Boolean).join(' ')}
      onPointerEnter={reach}
      onFocus={reach}
      {...props}
    />
  );
}
