import type { ComponentProps } from 'react';

/**
 * What Nextra's `Popup` resolves to on this site.
 *
 * `tools/popup-fold.mjs` turns every Twoslash hover into a plain button
 * before `rehypeTwoslashPopup` runs, and `PagePopover.tsx` shows its type, so
 * no page renders this. `rehypeTwoslashPopup` still adds
 * `import { Popup } from 'nextra/components'` to every page with a `twoslash`
 * fence, and Nextra's `Popup` brings headlessui and floating-ui to every page
 * through the one route Nextra 4 serves them from. The shim in
 * `nextra-components.ts` points that import here: plain elements, with no
 * client code.
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

function Panel(props: ComponentProps<'span'>) {
  return <span hidden {...props} />;
}

export const Popup = Object.assign(
  (props: ComponentProps<'span'>) => <span {...props} />,
  { Button, Panel },
);
