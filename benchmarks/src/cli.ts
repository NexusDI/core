/**
 * What every results writer shares: its --only and --check flags (and the
 * scale suite's --sizes and --shapes), the libraries and variants it
 * walks, the consumer it builds in, and how it writes a deterministic
 * file.
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
import { SHAPES, SIZES, type Shape, type Size } from './scale/config.ts';
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

/**
 * The comma-separated values of --name, each checked against `known`, or
 * undefined when the flag is absent. An unknown value throws: a typo would
 * otherwise run an empty suite and write an empty file.
 */
function listArg<T extends string | number>(
  name: string,
  known: readonly T[],
  parse: (raw: string) => T,
  argv: readonly string[],
): T[] | undefined {
  const raw = argValue(name, argv as string[]);
  if (raw === undefined) return undefined;
  return raw.split(',').map((x) => {
    const value = parse(x);
    if (!known.includes(value))
      throw new Error(`--${name}: ${x} is not one of ${known.join(', ')}`);
    return value;
  });
}

/** The scale sizes --sizes=50,200 names, or undefined for all. */
export function sizesArg(argv = process.argv): Size[] | undefined {
  return listArg<Size>('sizes', SIZES, (x) => Number(x) as Size, argv);
}

/** The scale shapes --shapes=mixed,wide names, or undefined for all. */
export function shapesArg(argv = process.argv): Shape[] | undefined {
  return listArg<Shape>('shapes', SHAPES, (x) => x as Shape, argv);
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
 * full run, under tmp/ for a partial one (--only, or the scale suite's
 * --sizes or --shapes). With --check, exits 1 when the file differs from
 * the one it replaced. `root` and `check` default to benchmarks/ and the
 * --check flag; tests pass their own.
 */
export function writeResult(
  kind: 'matrix' | 'probes' | 'size' | 'scale',
  file: unknown,
  partial: boolean,
  opts: { root?: string; check?: boolean } = {},
): void {
  const where = partial ? 'tmp' : 'results';
  const root = opts.root ?? BENCHMARKS;
  validate(kind, file, where);
  mkdirSync(join(root, where), { recursive: true });
  const out = join(root, where, `${kind}.json`);
  const text = JSON.stringify(file, null, 2) + '\n';
  const committed = existsSync(out) ? readFileSync(out, 'utf8') : '';
  writeFileSync(out, text);
  console.log(`Wrote ${out}`);
  const check = opts.check ?? process.argv.includes('--check');
  if (check && committed !== text) {
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
