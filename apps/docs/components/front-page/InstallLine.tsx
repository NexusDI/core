import CopyIsland from './CopyIsland';
import {
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
export default function InstallLine() {
  state ??= readReleaseState(process.cwd());
  const { command, version, tag } = installOf(state);
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
    </div>
  );
}
