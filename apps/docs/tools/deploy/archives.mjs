import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readDeployConfig } from './deploy-config.mjs';

/**
 * apps/docs/archives.json lists the release lines the site keeps at
 * /v{line}/, in ascending order (release spec §7.1.3). Line 0.3 is the
 * Docusaurus snapshot, whose asset names and checksums stay in deploy.json's
 * `snapshot` block. Every later line pins the stable core tag its archive
 * builds from.
 */
const KINDS = ['snapshot', 'tag'];
const LINE = /^(\d+)\.(\d+)$/;
const ENTRY_KEYS = { snapshot: ['line', 'kind'], tag: ['line', 'kind', 'tag'] };

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareLines(a, b) {
  const [, aMajor, aMinor] = LINE.exec(a).map(Number);
  const [, bMajor, bMinor] = LINE.exec(b).map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

function checkEntry(findings, entry, at, deployConfig) {
  const name = `archives[${at}]`;
  if (!isObject(entry)) {
    findings.push(`${name} must be an object with line and kind.`);
    return;
  }
  if (!KINDS.includes(entry.kind)) {
    findings.push(
      `${name}.kind must be "snapshot" or "tag"; found ${JSON.stringify(entry.kind)}.`,
    );
    return;
  }

  for (const key of Object.keys(entry)) {
    if (ENTRY_KEYS[entry.kind].includes(key)) continue;
    findings.push(
      entry.kind === 'snapshot'
        ? `${name} has an unknown key "${key}". The snapshot assets live in deploy.json.`
        : `${name} has an unknown key "${key}".`,
    );
  }

  if (entry.kind === 'snapshot') {
    if (entry.line !== '0.3') {
      findings.push(
        `${name} is a snapshot for line ${JSON.stringify(entry.line)}. Only line 0.3 has a snapshot; pin later lines by tag.`,
      );
    } else if (!isObject(deployConfig?.snapshot)) {
      findings.push(
        `${name} is the 0.3 snapshot, and deploy.json has no snapshot block to read its assets from.`,
      );
    }
    return;
  }

  // An archive is a finished line, so it pins a stable patch of that line,
  // never a prerelease or another package's tag.
  const expected = new RegExp(
    `^@nexusdi/core@${String(entry.line).replace('.', '\\.')}\\.\\d+$`,
  );
  if (typeof entry.tag !== 'string' || !expected.test(entry.tag)) {
    findings.push(
      `${name}.tag must be "@nexusdi/core@${entry.line}.N"; found ${JSON.stringify(entry.tag)}.`,
    );
  }
}

/** Every rule archives.json breaks, as sentences naming the entry and the fix. */
export function validateArchives(archives, deployConfig) {
  if (!isObject(archives)) return ['archives.json must hold one JSON object.'];

  const findings = [];
  for (const key of Object.keys(archives)) {
    if (key !== 'archives')
      findings.push(`archives.json has an unknown key "${key}".`);
  }
  if (!Array.isArray(archives.archives)) {
    findings.push('archives must be a list.');
    return findings;
  }

  let previous = null;
  archives.archives.forEach((entry, at) => {
    const line = entry?.line;
    if (typeof line !== 'string' || !LINE.test(line)) {
      findings.push(
        `archives[${at}].line must be X.Y, such as "0.4"; found ${JSON.stringify(line)}.`,
      );
    } else {
      if (previous !== null && compareLines(previous, line) >= 0) {
        findings.push(
          `archives[${at}].line "${line}" must come after "${previous}". Lines are ascending and unique.`,
        );
      }
      previous = line;
      checkEntry(findings, entry, at, deployConfig);
    }
  });

  return findings;
}

/**
 * archives.json, parsed and validated against the deploy.json in the same
 * directory. Throws with every finding.
 */
export function readArchives(path) {
  const archives = JSON.parse(readFileSync(path, 'utf8'));
  const deployConfig = readDeployConfig(join(dirname(path), 'deploy.json'));
  const findings = validateArchives(archives, deployConfig);
  if (findings.length > 0) {
    throw new Error(`${path} is invalid:\n- ${findings.join('\n- ')}`);
  }
  return archives;
}

// `node apps/docs/tools/deploy/archives.mjs apps/docs/archives.json`
// validates the file before docs.yml builds anything. docs.yml builds the
// 0.3 snapshot only, so a tag entry stops the run until the tag-archive
// build exists.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const { archives } = readArchives(
      process.argv[2] ?? 'apps/docs/archives.json',
    );
    if (archives.some((entry) => entry.kind === 'tag')) {
      console.error(
        'tag archives are not built yet; the docs.yml tag-archive build lands before 0.5.0.',
      );
      process.exitCode = 1;
    } else {
      console.log(
        `archives: ${archives.map((entry) => `/v${entry.line}/`).join(', ')}`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
