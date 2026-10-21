import { MERIDIAN_CONTRACT_VERSION as shell } from '@nexusdi/federation-contracts/version';

const [major, minor] = shell.split('.').map(Number);

/**
 * The contract version the drift build of this remote is built against: the
 * next minor of the shell's. The shell provides NAV_CHARTS at its own
 * version, so loading this build fails with NEXUS_CONTRACT_VERSION. The
 * drift config aliases `@nexusdi/federation-contracts/version` to this
 * file for the contracts package's imports alone, so this import still
 * reads the real version.
 */
export const MERIDIAN_CONTRACT_VERSION = `${major}.${minor + 1}.0`;
