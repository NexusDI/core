import { generateStaticParamsFor, importPage } from 'nextra/pages';

import { useMDXComponents as getMDXComponents } from '../../../mdx-components';
import { readChannel } from '../../channel';
import { keepRoute } from './static-params';

const listPages = generateStaticParamsFor('mdxPath');

// `output: 'export'` has no server, so a route missing from
// generateStaticParams must not render at request time either.
export const dynamicParams = false;

/**
 * One route per MDX file under `content/`, the root included: the segment is
 * an optional catch-all, so `/` is `content/index.mdx` like every other page
 * (spec §4.1). The `/next/` build drops `blog/` (spec §6.1).
 */
export async function generateStaticParams() {
  const channel = readChannel();
  return (await listPages()).filter((entry: { mdxPath?: string[] }) =>
    keepRoute(entry.mdxPath, channel),
  );
}

interface PageProps {
  params: Promise<{ mdxPath?: string[] }>;
}

export async function generateMetadata(props: PageProps) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  return metadata;
}

/**
 * The theme's page frame: table of contents, breadcrumbs, the
 * `data-pagefind-body` region and the previous and next links. Every page
 * renders inside it unchanged (spec §5.4).
 */
const Wrapper = getMDXComponents().wrapper;

export default async function Page(props: PageProps) {
  const params = await props.params;
  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode,
  } = await importPage(params.mdxPath);

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
