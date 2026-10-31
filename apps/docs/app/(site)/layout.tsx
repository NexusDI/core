import type { ReactNode } from 'react';

import { Layout } from 'nextra-theme-docs';
import { getPageMap } from 'nextra/page-map';

import Search from '../../components/chrome/Search';
import SiteFooter from '../../components/chrome/SiteFooter';
import SiteNavbar from '../../components/chrome/SiteNavbar';

/**
 * The docs chrome of site UX spec 13: navbar, sidebar, search and footer,
 * over every content page. The navbar and the footer are shared components
 * (`components/chrome/`), so the front page and the feature pages mount them
 * too. `getPageMap()` reads the page map Nextra compiles from `content/`;
 * under `output: 'export'` it runs once, at build time.
 */
export default async function SiteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Layout
      navbar={<SiteNavbar />}
      search={<Search />}
      pageMap={await getPageMap()}
      docsRepositoryBase="https://github.com/NexusDI/core/tree/main/apps/docs"
      footer={<SiteFooter year={new Date().getFullYear()} />}
    >
      {children}
    </Layout>
  );
}
