import type { ReactNode } from 'react';

import { ThemeProvider } from 'next-themes';
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { Head } from 'nextra/components';
import 'nextra-theme-docs/style.css';
import './global.css';

/**
 * The three families spec §8.3 names, self-hosted: `next/font` downloads the
 * files during the build and serves them from this site, so a page makes no
 * request to Google. Each exposes a custom property that `global.css` reads.
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const body = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-body',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
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
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      lang="en"
      dir="ltr"
      suppressHydrationWarning
    >
      <Head />
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
