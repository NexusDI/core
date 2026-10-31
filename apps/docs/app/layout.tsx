import type { ReactNode } from 'react';

import { ThemeProvider } from 'next-themes';
import localFont from 'next/font/local';
import { Head } from 'nextra/components';
import 'nextra-theme-docs/style.css';
import './global.css';
import { readBasePath } from './channel';
import { meridianBackground, meridianColor } from './meridian-theme';

/**
 * The four families design system spec section 5.1 names, self-hosted. The latin woff2 files come
 * from pinned @fontsource packages in devDependencies, so the build reads them
 * from `node_modules` and makes no network request. `next/font` copies them
 * into the output and serves them from this site. Each family exposes a custom
 * property that `global.css` reads. The options are literals because
 * `next/font` reads them at build time without running this module.
 */
const display = localFont({
  src: '../../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
  weight: '300 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-display',
});

const body = localFont({
  src: [
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-body',
});

const condensed = localFont({
  src: [
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-condensed',
});

const mono = localFont({
  src: [
    {
      path: '../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata = {
  title: { default: 'NexusDI', template: '%s | NexusDI' },
  description:
    'NexusDI is a dependency injection container for TypeScript that checks the whole module graph when the container starts.',
  metadataBase: new URL('https://nexus.js.org'),
};

/**
 * The document every route renders inside. The docs chrome lives one level
 * down in `(site)/layout.tsx`; the tool routes of phase 2 render beside it.
 *
 * `ThemeProvider` sits here so a tool route outside Nextra's `Layout` still
 * gets the `dark` class on `html` from the blocking script `next-themes`
 * writes. The options are the defaults `nextra-theme-docs` parses, so a docs
 * page behaves as it would under Nextra's own provider. The theme stylesheet
 * loads ahead of `global.css`, whose later declarations win.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${display.variable} ${body.variable} ${condensed.variable} ${mono.variable}`}
      lang="en"
      dir="ltr"
      suppressHydrationWarning
    >
      <Head backgroundColor={meridianBackground} color={meridianColor}>
        {/* The colours of every highlighted token on the site, one class per
            pair of theme colours (`tools/code-classes.mjs`), which
            `docs:behaviour-data` writes. Linked from `public/` and not
            imported: in Turbopack's module graph, with its classes on the
            tokens of every page, the libraries site's compile went from 80
            seconds to 13 minutes. */}
        <link rel="stylesheet" href={`${readBasePath()}/code-classes.css`} />
      </Head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          storageKey="theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
