import { Layout, Navbar } from 'nextra-theme-docs';
import { getPageMap } from 'nextra/page-map';
import type { ReactNode } from 'react';

const navbar = (
  <Navbar logo={<b>NexusDI</b>} projectLink="https://github.com/NexusDI/core" />
);

/**
 * The docs chrome: navbar, sidebar, search. A route group, so it names no URL
 * segment, and `(tool)` routes can render outside it (spec §4.1).
 */
export default async function SiteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Layout
      navbar={navbar}
      pageMap={await getPageMap()}
      docsRepositoryBase="https://github.com/NexusDI/core/tree/main/apps/docs"
    >
      {children}
    </Layout>
  );
}
