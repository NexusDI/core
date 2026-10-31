import { generateStaticParamsFor, importPage } from 'nextra/pages';

import { bandOf } from '../../bands';
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

const { wrapper: Wrapper, h1: ThemeH1 } = getMDXComponents();

/**
 * A code page's H1 is the code as inline code (site UX spec 13.4). It also
 * outranks every other match in the search index, so a search for
 * `NEXUS_MISSING_PROVIDER` returns its code page first (13.5).
 */
function CodeH1(props: React.ComponentProps<'h1'>) {
  return (
    <ThemeH1 {...props} data-pagefind-weight="10">
      <code className="nextra-code">{props.children}</code>
    </ThemeH1>
  );
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode,
  } = await importPage(params.mdxPath);

  const band = bandOf(params.mdxPath?.[0] ?? 'index');

  state ??= readReleaseState(process.cwd());
  // The front page carries the notice's facts in its hero (TL29).
  const notice = params.mdxPath ? releaseNotice(state, readChannel()) : null;

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      {notice ? (
        <ReleaseNotice text={notice} candidate={inCandidacy(state)} />
      ) : null}
      {band ? (
        <span hidden data-pagefind-filter="band[data-band]" data-band={band} />
      ) : null}
      <MDXContent
        {...props}
        params={params}
        {...((metadata as { kind?: string }).kind === 'code'
          ? { components: { h1: CodeH1 } }
          : {})}
      />
    </Wrapper>
  );
}
