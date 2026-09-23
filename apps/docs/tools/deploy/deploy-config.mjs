import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The deploy modes of spec §15.1, in the order the site moves through them.
 * A mode change is a one-line pull request against apps/docs/deploy.json.
 */
export const MODES = ['snapshot-only', 'rc', 'final', 'retired'];

const KEYS = ['mode', 'root', 'snapshot', 'finalDate'];
const COMMIT = /^[0-9a-f]{7,40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkAsset(findings, asset, role, revision) {
  const expected = `nexusdi-docs-0.3-${role}-r${revision}.tar.gz`;
  if (!isObject(asset)) {
    findings.push(
      `snapshot.assets.${role} must name the archive and its sha256.`,
    );
    return;
  }
  if (asset.name !== expected) {
    findings.push(
      `snapshot.assets.${role}.name must be "${expected}"; found "${asset.name}".`,
    );
  }
  if (typeof asset.sha256 !== 'string' || !SHA256.test(asset.sha256)) {
    findings.push(
      `snapshot.assets.${role}.sha256 must be 64 lowercase hex characters.`,
    );
  }
}

/** Every rule deploy.json breaks, as sentences naming the field and the fix. */
export function validateDeployConfig(config) {
  if (!isObject(config)) return ['deploy.json must hold one JSON object.'];

  const findings = [];

  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key))
      findings.push(`deploy.json has an unknown key "${key}".`);
  }

  if (!MODES.includes(config.mode)) {
    findings.push(
      `mode must be one of ${MODES.join(', ')}; found "${config.mode}".`,
    );
  }

  const root = config.root;
  if (!isObject(root)) {
    findings.push('root must be an object with tag, sha and reason.');
  } else {
    if (
      root.sha !== null &&
      (typeof root.sha !== 'string' || !COMMIT.test(root.sha))
    ) {
      findings.push(
        `root.sha must be a 7 to 40 character commit id; found "${root.sha}".`,
      );
    } else if (
      root.sha !== null &&
      (typeof root.reason !== 'string' || root.reason.trim() === '')
    ) {
      findings.push(
        'root.sha is set, so root.reason must say why the root cannot wait for the next release.',
      );
    }
    if (root.tag !== null && typeof root.tag !== 'string') {
      findings.push('root.tag must be null or a tag name.');
    }
  }

  const snapshot = config.snapshot;
  if (!isObject(snapshot)) {
    findings.push('snapshot must be an object.');
    return findings;
  }
  if (snapshot.release !== 'docs-snapshot-0.3') {
    findings.push('snapshot.release must be "docs-snapshot-0.3".');
  }
  if (typeof snapshot.source !== 'string' || !COMMIT.test(snapshot.source)) {
    findings.push('snapshot.source must be a commit id.');
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) {
    findings.push('snapshot.revision must be a whole number, 0 or more.');
  } else if (snapshot.revision === 0) {
    if (snapshot.assets !== null) {
      findings.push(
        'snapshot.assets must be null while snapshot.revision is 0.',
      );
    }
    if (config.mode !== 'snapshot-only' && MODES.includes(config.mode)) {
      findings.push(
        `mode "${config.mode}" needs snapshot.revision 1 or later. Run docs-snapshot.yml and merge its pull request first.`,
      );
    }
  } else {
    const assets = isObject(snapshot.assets) ? snapshot.assets : {};
    checkAsset(findings, assets.root, 'root', snapshot.revision);
    checkAsset(findings, assets.archive, 'archive', snapshot.revision);
  }

  const needsDate = config.mode === 'final' || config.mode === 'retired';
  if (
    needsDate &&
    (typeof config.finalDate !== 'string' || !DATE.test(config.finalDate))
  ) {
    findings.push(`mode "${config.mode}" needs finalDate as YYYY-MM-DD.`);
  }
  if (!needsDate && MODES.includes(config.mode) && config.finalDate !== null) {
    findings.push(`finalDate must be null in mode "${config.mode}".`);
  }

  return findings;
}

/** deploy.json, parsed and validated. Throws with every finding. */
export function readDeployConfig(path) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const findings = validateDeployConfig(config);
  if (findings.length > 0) {
    throw new Error(`${path} is invalid:\n- ${findings.join('\n- ')}`);
  }
  return config;
}

/** The fields docs.yml reads, as GitHub step outputs. */
export function outputsFor(config) {
  const assets = config.snapshot.assets;
  return {
    mode: config.mode,
    revision: String(config.snapshot.revision),
    root_asset: assets?.root.name ?? '',
    root_sha256: assets?.root.sha256 ?? '',
    archive_asset: assets?.archive.name ?? '',
    archive_sha256: assets?.archive.sha256 ?? '',
    root_sha: config.root.sha ?? '',
  };
}

// `node apps/docs/tools/deploy/deploy-config.mjs apps/docs/deploy.json`
// validates the file and writes the outputs docs.yml reads.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = readDeployConfig(process.argv[2] ?? 'apps/docs/deploy.json');
  const lines = Object.entries(outputsFor(config)).map(([k, v]) => `${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
  console.log(lines.join('\n'));
}
