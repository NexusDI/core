import Link from 'next/link';

/**
 * The release notice above a page's H1 (spec §5.1). The text comes from
 * `releaseNotice()` at build time, so no version is written by hand. Code
 * spans in the sentence render as `<code>`. During the RC window it links the
 * page that says how to try the release candidate.
 */
export default function ReleaseNotice({
  text,
  candidate,
}: {
  text: string;
  candidate: boolean;
}) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <p className="nexus-release" role="note">
      {parts.map((part, at) =>
        part.startsWith('`') ? <code key={at}>{part.slice(1, -1)}</code> : part,
      )}
      {candidate ? (
        <>
          {' '}
          <Link href="/release-candidate/">Try the release candidate.</Link>
        </>
      ) : null}
    </p>
  );
}
