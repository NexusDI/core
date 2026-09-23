import { Head } from 'nextra/components';
import 'nextra-theme-docs/style.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: { default: 'NexusDI', template: '%s | NexusDI' },
  description:
    'Documentation for NexusDI, a dependency injection container for TypeScript.',
  metadataBase: new URL('https://nexus.js.org'),
};

/**
 * The document every route renders inside. The docs chrome lives one level
 * down in `(site)/layout.tsx`.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>{children}</body>
    </html>
  );
}
