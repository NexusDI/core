import { generateStaticParamsFor, importPage } from 'nextra/pages';

import ReleaseNotice from '../../../components/ReleaseNotice';
import { useMDXComponents as getMDXComponents } from '../../../mdx-components';
import { readBasePath, readChannel } from '../../channel';
import {
  inCandidacy,
  readReleaseState,
  releaseNotice,
  type ReleaseState,
} from '../../release-state';
import { pageMetadata } from './page-metadata';
import { keepRoute } from './static-params';

/** `output: 'export'` renders only listed routes; nothing is rendered on demand. */
export const dynamicParams = false;

const listPages = generateStaticParamsFor('mdxPath');

/**
 * One route per MDX file under `content/`, the landing page included (an
 * optional catch-all, so `/` is `content/index.mdx`). The `/next/` build leaves
 * the blog out (spec §6.1).
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
  return pageMetadata(metadata, params.mdxPath, readChannel(), readBasePath());
}

let state: ReleaseState | undefined;

const Wrapper = getMDXComponents().wrapper;

export default async function Page(props: PageProps) {
  const params = await props.params;
  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode,
  } = await importPage(params.mdxPath);

  state ??= readReleaseState(process.cwd());
  const notice = releaseNotice(state, readChannel());

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      {notice ? (
        <ReleaseNotice text={notice} candidate={inCandidacy(state)} />
      ) : null}
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
