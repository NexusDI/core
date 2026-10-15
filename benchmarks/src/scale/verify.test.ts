import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { classifyScale } from '../outcome.ts';
import { expectedDigest } from './graph.ts';
import { six, sixWithAlias } from './six.ts';

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

// six() with p5 taking p4's deps, so the two sinks differ in id alone.
const twinSinks = six();
twinSinks.providers[5].deps = [2, 3];
const twinFile = join(dir, 'twin-sinks.json');
writeFileSync(twinFile, JSON.stringify(twinSinks));

const verify = (brk?: string, bundle = FAKE, model = graphFile) =>
  JSON.parse(
    execFileSync(process.execPath, [CHILD, bundle, model], {
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
      ids: true,
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
      ids: true,
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
    expect(out.built).toBe(false);
    expect(classifyScale(out, null, expected).outcome).toBe('wrong-instance');
  });
  it('reports kinds: false for a factory rendered as a class', () => {
    const out = verify('factory-as-class');
    expect(out).toEqual({
      digest: expected,
      shared: true,
      built: true,
      kinds: false,
      ids: true,
    });
    expect(classifyScale(out, null, expected)).toEqual({
      outcome: 'wrong-instance',
      message: 'kinds',
    });
  });
  it('reports ids: false for two sinks with the same deps swapped', () => {
    const out = verify('swap-sinks', FAKE, twinFile);
    const twin = expectedDigest(twinSinks);
    expect(out).toEqual({
      digest: twin,
      shared: true,
      built: true,
      kinds: true,
      ids: false,
    });
    expect(classifyScale(out, null, twin)).toEqual({
      outcome: 'wrong-instance',
      message: 'ids',
    });
  });
  it.each([
    ['count', /count: app declares 7 providers, the model 6/],
    ['target', /target: app targets 5, the model 4/],
    ['entries', /entries: app declares \[4\], the model \[4,5\]/],
  ])(
    'calls an app whose %s differs from the model a wrong-instance',
    (field, message) => {
      const out = verify(`declare-${field}`);
      expect(classifyScale(out, null, expected)).toEqual({
        outcome: 'wrong-instance',
        message: expect.stringMatching(message),
      });
    },
  );
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

describe('verify-child.mjs with an alias', () => {
  const aliasModel = sixWithAlias();
  const aliasFile = join(dir, 'graph-alias.json');
  writeFileSync(aliasFile, JSON.stringify(aliasModel));
  const aliasDigest = expectedDigest(aliasModel);
  const verifyAlias = (brk?: string) =>
    JSON.parse(
      execFileSync(process.execPath, [CHILD, FAKE, aliasFile], {
        encoding: 'utf8',
        env: { ...process.env, FAKE_ALIAS: '1', FAKE_BREAK: brk ?? '' },
      }),
    ) as Record<string, unknown>;

  it('passes an alias that returns its target instance and constructs nothing', () => {
    const out = verifyAlias();
    expect(out).toEqual({
      digest: aliasDigest,
      shared: true,
      built: true,
      kinds: true,
      ids: true,
    });
    expect(classifyScale(out, null, aliasDigest)).toEqual({ outcome: 'pass' });
  });
  it('writes the alias line as <alias>(<target>) in the digest', () => {
    expect(aliasDigest).toBe(expectedDigest(sixWithAlias()));
    expect(aliasDigest).not.toBe(expected);
  });
  it('reports shared: false for an alias that returns a copy of its target', () => {
    const out = verifyAlias('alias-copy');
    expect(out.shared).toBe(false);
    expect(classifyScale(out, null, aliasDigest).outcome).toBe(
      'wrong-instance',
    );
  });
  it('reports kinds: false for an alias that counts a construction, as for a value', () => {
    const out = verifyAlias('alias-counted');
    expect(out.kinds).toBe(false);
    expect(classifyScale(out, null, aliasDigest).outcome).toBe(
      'wrong-instance',
    );
  });
});
