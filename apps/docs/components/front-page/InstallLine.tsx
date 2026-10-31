import Link from 'next/link';

import { readChannel } from '../../app/channel';
import CopyIsland from './CopyIsland';
import {
  heroReleaseLine,
  inCandidacy,
  readReleaseState,
  type ReleaseState,
} from '../../app/release-state';

let state: ReleaseState | undefined;

/** What the install line prints for a release state. */
export function installOf(release: ReleaseState): {
  command: string;
  version: string | null;
  tag: string | null;
} {
  if (inCandidacy(release) && release.rc !== null) {
    return {
      command: 'npm install @nexusdi/core@next',
      version: release.rc,
      tag: 'next',
    };
  }
  if (release.stable !== null) {
    return {
      command: 'npm install @nexusdi/core',
      version: release.stable,
      tag: 'latest',
    };
  }
  return {
    command: 'npm install @nexusdi/core@next',
    version: null,
    tag: null,
  };
}

/**
 * The install command in a terminal strip with a copy button (site UX spec
 * 4.2 and 4.10), and in `micro` type the version that
 * `app/release-state.ts` reads from the release tags at build time. The page
 * writes no version.
 */
export default function InstallLine({
  releaseLine = false,
}: {
  /** The hero's install line adds the facts of the notice that /next/ drops above the H1 (TL29). */
  releaseLine?: boolean;
}) {
  state ??= readReleaseState(process.cwd());
  const { command, version, tag } = installOf(state);
  const release = releaseLine ? heroReleaseLine(state, readChannel()) : null;
  return (
    <div className="nexus-install">
      <div className="nexus-install__strip">
        <code>
          <span aria-hidden="true" className="nexus-install__prompt">
            $
          </span>
          {command}
        </code>
        <CopyIsland text={command} />
      </div>
      {version ? (
        <p className="nexus-install__note">
          <code>{version}</code> on the <code>{tag}</code> tag
        </p>
      ) : null}
      {release ? (
        <p className="nexus-install__note nexus-install__release">
          {release.text}
          {release.candidate ? (
            <>
              {' '}
              <Link href="/release-candidate/">Try the release candidate.</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
