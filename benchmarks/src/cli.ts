/**
 * What every results writer shares: its --only and --check flags, the
 * libraries and variants it walks, the consumer it builds in, and how it
 * writes a deterministic file.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { makeCell, prepareConsumer } from './consumer.ts';
import {
  BENCHMARKS,
  FIXTURES,
  readLibraries,
  type Library,
} from './libraries.ts';
import {
  LIBRARIES,
  validate,
  type LibraryId,
  type MatrixFile,
  type Profile,
  type Variant,
} from './schema.ts';

/** The value of --name=value, or undefined. */
export function argValue(
  name: string,
  argv = process.argv,
): string | undefined {
  return argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** --seed=n, or a random seed the run records. */
export function seedArg(): number {
  return Number(argValue('seed') ?? Math.floor(Math.random() * 2 ** 31));
}

/** The libraries --only=a,b names, or undefined for all. */
export function onlyArg(argv = process.argv): LibraryId[] | undefined {
  return argValue('only', argv)
    ?.split(',')
    .filter((id): id is LibraryId =>
      (LIBRARIES as readonly string[]).includes(id),
    );
}

/** The libraries a run covers, sorted by id; `keep` stays in whatever --only says. */
export function selectLibraries(
  only: readonly LibraryId[] | undefined,
  keep?: LibraryId,
): Library[] {
  return readLibraries()
    .libraries.filter(
      (l) => only === undefined || l.id === keep || only.includes(l.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** A library's variants, sorted. */
export function variantsOf(lib: Library): Variant[] {
  return (Object.keys(lib.variants) as Variant[]).sort();
}

/** A cell holding the library-variant's Meridian-8 fixture under its profile. */
export function fixtureCell(
  dir: string,
  name: string,
  lib: Library,
  variant: Variant,
): { cellDir: string; profile: Profile } {
  const spec = lib.variants[variant];
  if (spec === undefined) throw new Error(`${lib.id} has no ${variant}`);
  return {
    cellDir: makeCell(
      dir,
      name,
      join(FIXTURES, lib.id, `${variant}.ts`),
      spec.profile,
    ),
    profile: spec.profile,
  };
}

/** Runs `fn` in a fresh consumer for `libraries`, and removes it after, sync or async. */
export function withConsumer<T>(
  libraries: readonly Library[],
  fn: (dir: string) => T,
): T {
  const dir = prepareConsumer({ libraries: libraries.map((l) => l.id) });
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const result = fn(dir);
    if (result instanceof Promise) return result.finally(cleanup) as T;
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

/**
 * Validates and writes a deterministic results file: under results/ for a
 * full run, under tmp/ for an --only run. With --check, exits 1 when the
 * file differs from the one it replaced.
 */
export function writeResult(
  kind: 'matrix' | 'probes' | 'size',
  file: unknown,
  only: readonly LibraryId[] | undefined,
): void {
  const where = only === undefined ? 'results' : 'tmp';
  validate(kind, file, where);
  mkdirSync(join(BENCHMARKS, where), { recursive: true });
  const out = join(BENCHMARKS, where, `${kind}.json`);
  const text = JSON.stringify(file, null, 2) + '\n';
  const committed = existsSync(out) ? readFileSync(out, 'utf8') : '';
  writeFileSync(out, text);
  console.log(`Wrote ${out}`);
  if (process.argv.includes('--check') && committed !== text) {
    console.error(`${kind}.json changed. Commit the file the run wrote.`);
    process.exit(1);
  }
}

/** The matrix outcome of every cell, from the committed file or a local run. */
export function readMatrix(): MatrixFile {
  for (const where of ['results', 'tmp']) {
    const path = join(BENCHMARKS, where, 'matrix.json');
    if (existsSync(path))
      return JSON.parse(readFileSync(path, 'utf8')) as MatrixFile;
  }
  throw new Error('no matrix.json: run the matrix first');
}
