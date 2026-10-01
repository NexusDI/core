import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { classifyScale } from '../outcome.ts';
import { expectedDigest } from './graph.ts';
import { six } from './six.ts';

const CHILD = join(import.meta.dirname, 'verify-child.mjs');
const FAKE = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  '__test__',
  'fake-scale.mjs',
);

const dir = mkdtempSync(join(tmpdir(), 'scale-verify-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const graphFile = join(dir, 'graph.json');
writeFileSync(graphFile, JSON.stringify(six()));

const verify = (brk?: string, bundle = FAKE) =>
  JSON.parse(
    execFileSync(process.execPath, [CHILD, bundle, graphFile], {
      encoding: 'utf8',
      env: { ...process.env, FAKE_BREAK: brk ?? '' },
    }),
  ) as Record<string, unknown>;

const expected = expectedDigest(six());

describe('expectedDigest', () => {
  it('hashes the sorted id(dep ids) lines of the model', () => {
    const lines = [
      'p0()',
      'p1(p0)',
      'p2(p0,p1)',
      'p3(p1)',
      'p4(p2,p3)',
      'p5(p3)',
    ];
    expect(expected).toBe(
      createHash('sha256').update(lines.join('\n')).digest('hex'),
    );
  });
  it('changes when the dependency order changes', () => {
    const g = six();
    g.providers[4].deps = [3, 2];
    expect(expectedDigest(g)).not.toBe(expected);
  });
});

describe('verify-child.mjs', () => {
  it('passes the fake built as the model says', () => {
    const out = verify();
    expect(out).toEqual({
      digest: expected,
      shared: true,
      built: true,
      kinds: true,
    });
    expect(classifyScale(out, null, expected)).toEqual({ outcome: 'pass' });
  });
  it('resolves through getAsync where the adapter has it', () => {
    // In this mode the fake's sync get throws, so a pass proves the child
    // never called it.
    const out = verify('async');
    expect(classifyScale(out, null, expected).outcome).toBe('pass');
  });
  it('calls a swapped dependency a wrong-instance', () => {
    const out = verify('swap');
    expect(out.digest).not.toBe(expected);
    expect(classifyScale(out, null, expected)).toMatchObject({
      outcome: 'wrong-instance',
      message: expect.stringContaining('digest'),
    });
  });
  it('reports built: false for a factory that builds twice', () => {
    const out = verify('build-twice');
    expect(out).toEqual({
      digest: expected,
      shared: true,
      built: false,
      kinds: true,
    });
    expect(classifyScale(out, null, expected)).toEqual({
      outcome: 'wrong-instance',
      message: 'built',
    });
  });
  it('reports shared: false for a sink registered as transient', () => {
    const out = verify('transient-sink');
    expect(out.digest).toBe(expected);
    expect(out.shared).toBe(false);
    expect(classifyScale(out, null, expected).outcome).toBe('wrong-instance');
  });
  it('reports kinds: false for a factory rendered as a class', () => {
    const out = verify('factory-as-class');
    expect(out).toEqual({
      digest: expected,
      shared: true,
      built: true,
      kinds: false,
    });
    expect(classifyScale(out, null, expected)).toEqual({
      outcome: 'wrong-instance',
      message: 'kinds',
    });
  });
  it('reports kinds: false for a value that constructs', () => {
    expect(verify('value-as-factory').kinds).toBe(false);
  });
  it('gives runtime-error through classify for a throwing create', () => {
    const out = verify('throw');
    expect(out).toEqual({ error: 'Error: create broke' });
    expect(classifyScale(out, null, expected)).toEqual({
      outcome: 'runtime-error',
      message: 'Error: create broke',
    });
  });
  it('gives compile-error for a bundle that fails to load', () => {
    const out = verify(undefined, join(dir, 'missing.mjs'));
    expect(out.load).toMatch(/Cannot find module|ERR_MODULE_NOT_FOUND/);
    expect(classifyScale(out, null, expected).outcome).toBe('compile-error');
  });
  it('gives compile-error for a failed build', () => {
    expect(classifyScale(null, 'TS2304: Cannot find name', expected)).toEqual({
      outcome: 'compile-error',
      message: 'TS2304: Cannot find name',
    });
  });
});
