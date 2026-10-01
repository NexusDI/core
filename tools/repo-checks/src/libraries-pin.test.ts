import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/**
 * The ported agent, the ported skill and the guards follow the libraries
 * documents at one commit (spec section 14.5). The agent and the skill fetch
 * those documents at the pinned SHA, so a pin bump is the one place the site
 * adopts a change to the standard.
 */

const PIN = join(workspaceRoot, 'apps/docs/libraries-pin.json');
const AGENT = join(workspaceRoot, '.claude/agents/docs-reviewer.md');
const SKILL = join(workspaceRoot, '.claude/skills/docs-page/SKILL.md');

const pin = JSON.parse(readFileSync(PIN, 'utf8')) as {
  repository: string;
  sha: string;
  documents: string[];
};
const agent = readFileSync(AGENT, 'utf8');
const skill = readFileSync(SKILL, 'utf8');

describe('the libraries pin', () => {
  it('names a full commit of Evanion/libraries', () => {
    expect(pin.repository).toBe('Evanion/libraries');
    expect(pin.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('pins the ten documents the docs spec follows', () => {
    expect([...pin.documents].sort()).toEqual([
      'docs/specs/2026-09-12-baize-ui.md',
      'docs/specs/2026-09-13-interactive-examples.md',
      'docs/specs/2026-09-13-released-by-default.md',
      'docs/specs/2026-09-13-versioned-docs.md',
      'docs/specs/2026-09-16-diagrams.md',
      'docs/specs/2026-09-16-documentation-standard.md',
      'docs/specs/2026-09-20-public-documentation-guidance.md',
      'docs/specs/2026-09-21-docs-api-reference.md',
      'docs/specs/2026-09-21-reference-page-budget.md',
      'docs/specs/2026-09-22-docs-tests-per-export.md',
    ]);
  });
});

describe('the ported agent and skill', () => {
  it('name every pinned document', () => {
    const missing = pin.documents.filter(
      (path) => !agent.includes(path) && !skill.includes(path),
    );
    expect(
      missing,
      'Name each pinned document in the agent or the skill.',
    ).toEqual([]);
  });

  it('name no libraries document the pin leaves out', () => {
    const named = [
      ...`${agent}\n${skill}`.matchAll(/docs\/specs\/[\w.-]+\.md/g),
    ].map((match) => match[0]);
    expect(named.filter((path) => !pin.documents.includes(path))).toEqual([]);
  });

  it('fetch the documents at the pinned SHA', () => {
    for (const text of [agent, skill]) {
      expect(text).toContain('apps/docs/libraries-pin.json');
      expect(text).toContain(
        'https://raw.githubusercontent.com/Evanion/libraries/<sha>/<path>',
      );
    }
  });

  it('name no package of the libraries repo', () => {
    expect(`${agent}\n${skill}`).not.toMatch(/@evanion\//);
  });

  it('carry the checks spec section 14.6 adds and the owner rules', () => {
    for (const phrase of [
      'Each section that teaches a mechanism has the reader run it, break it and fix it.',
      'Never the word "native", and no metadata library by name.',
      'A `ConsoleView` caption states in words what its view shows.',
      'No sentence sends the reader to the console',
      'A mission briefing names every export its checks read.',
      'A claim about another library on `/comparison/` cites its source and its version.',
    ]) {
      expect(agent).toContain(phrase);
    }
  });

  it('carry the four traps spec section 14.7 adds', () => {
    for (const phrase of [
      'A link written as `/next/…` breaks at the swap.',
      'Console fixtures and seed JavaScript are built from `libs/core/dist`.',
      'A `mission.ts` edit that changes an objective raises `version`',
      'A new decoy that passes its objective means the check is too weak.',
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it('write no em dash', () => {
    expect(`${agent}\n${skill}`).not.toMatch(/\u2014/);
  });
});
