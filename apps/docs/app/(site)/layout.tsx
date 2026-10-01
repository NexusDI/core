import type { ReactNode } from 'react';

import { Footer, Layout, Navbar, ThemeSwitch } from 'nextra-theme-docs';
import { getPageMap } from 'nextra/page-map';

/**
 * The theme switch sits in the navbar, because the landing page has no
 * sidebar and a reader there still needs it. `global.css` hides the sidebar's
 * copy so a docs page shows one switch.
 */
const navbar = (
  <Navbar logo={<b>NexusDI</b>} projectLink="https://github.com/NexusDI/core">
    <ThemeSwitch lite />
  </Navbar>
);

const footer = <Footer>MIT {new Date().getFullYear()} © NexusDI.</Footer>;

/**
 * The docs chrome: navbar, sidebar, search and footer, over every content
 * page. `getPageMap()` reads the page map Nextra compiles from `content/`;
 * under `output: 'export'` it runs once, at build time.
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
      footer={footer}
    >
      {children}
    </Layout>
  );
}
