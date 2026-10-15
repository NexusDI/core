import type { ComponentProps } from 'react';

import { PopupRoot } from './popup.client';
import './popup.css';

/**
 * The twoslash hover Nextra's renderer writes as `<Popup>`, `<Popup.Button>`
 * and `<Popup.Panel>` (`nextra/dist/server/twoslash.js`), with the panel
 * rendered on the server.
 *
 * The button is a real `<button>` and the panel carries the type in the HTML,
 * `hidden`, so a reader without JavaScript sees it on hover or focus through
 * `popup.css`. `PopupRoot` loads the positioning on the first pointer or
 * focus that reaches it. Search is unaffected: every `<pre>` on the site
 * carries `data-pagefind-ignore`.
 */

function Button({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={['nexus-popup__button', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

// A span, since the panel sits inside the fence's `<code>`, which holds
// phrasing content only. `.twoslash-popup-container` gives it its block box.
function Panel({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      hidden
      className={['nexus-popup__panel', 'x:max-w-2xl!', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}

export const Popup = Object.assign(
  (props: ComponentProps<'span'>) => <PopupRoot {...props} />,
  { Button, Panel },
);
