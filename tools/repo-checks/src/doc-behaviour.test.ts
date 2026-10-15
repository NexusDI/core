import { join, sep } from 'node:path';

import { behavioursOf, describedBy } from '@nexusdi/doc-examples/behaviours';
import {
  readDeclarationFiles,
  readPackageExports,
  type ExportInfo,
} from '@nexusdi/doc-examples/package-exports';
import { workspaceRoot } from '@nx/devkit';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadLibraries, type Library } from './docs/loaders';
import { whiteBoxNames } from './docs/white-box';

/**
 * G11: every non-error callable export has a `describe` naming it.
 *
 * The API reference lists, under each export, the sentences its own tests
 * carry. A case belongs to an export when some `describe` in its chain spells
 * that export's name exactly. A reference walk would attach a case to every
 * name it mentions, and only the `describe` says what the author meant the
 * case to be about.
 *
 * Exactly, and at any depth. `describe('Nexus')` owns its cases,
 * `describe('the Nexus facade')` owns nothing, and
 * `Nexus > create > rejects a module the root never imports` belongs to
 * `Nexus` at depth one, under the condition the suite wrote.
 *
 * An error class is exempt. What a reader wants to know about
 * `NexusError` is which call throws it and when, and that sentence belongs
 * under the function that throws it. Every error class of `@nexusdi/core`
 * also has a code page under `/errors/`.
 *
 * The rule fails and never reports. Every library adopts the convention, so
 * the debt is zero, and an allowance file would only let the next export skip
 * the rule.
 *
 * The chains come from `@nexusdi/doc-examples/behaviours`, the reader the
 * reference pages render from, and the export lists from
 * `@nexusdi/doc-examples/package-exports`, the list `docs:behaviour-data`
 * writes its sidecars from. The rule and the page read the same two lists.
 * `testFilesOf` leaves out `libs/core/src/security`, whose titles are register
 * identifiers, and the suites a target of their own runs, so neither satisfies
 * the rule.
 *
 * It also asks that two export names never stack. A `describe` naming an
 * export inside a `describe` naming another one puts the inner export's
 * sentences on two entries: its own, and the outer one's, where the rail
 * labels a group with an export name beside the conditions the suite wrote.
 * Promoting the inner block to the top level fixes it and moves no assertion.
 *
 * It never asks that every `describe` name an export: a README doctest's
 * heading and an internal function such as `buildView` belong to no export.
 * It never asks that a type have one. It does not read `it` titles.
 *
 * Each package's own tests state its exports' behaviour. No NexusDI package
 * re-exports a callable another package declares, and
 * `declares every callable export inside its own package` holds that, so a
 * name is never owed a `describe` in a suite that does not own its code.
 *
 * Ported from `Evanion/libraries` `tools/repo-checks/src/doc-behaviour.test.ts`
 * at 92320250.
 */

/**
 * Names the rule reports and the repository accepts, each with its reason.
 *
 * Kept inline beside the rule, on `exported-type-closure.test.ts`'s reading: a
 * ratchet is for a debt somebody intends to pay, and a name here is a decision
 * that the convention does not apply. A reader meets the reason beside the
 * rule, where it is likelier to be argued with than in a JSON list.
 *
 * None today. Every non-error callable export of every library carries a
 * `describe` naming it.
 */
const ACCEPTED: Readonly<Record<string, string>> = {};

/**
 * Unexported `src` names a case on an export's rail may use, keyed
 * `<package>: <name>`, each with its reason. A test helper that lives under
 * `src` and is no export belongs here. Helpers under `test-support/` sit
 * outside `src` and need no entry, which is also the rule's limit: a helper
 * there that re-exports an internal name lets a case reach it unseen
 * (`docs/white-box.ts`).
 *
 * None today.
 */
const HELPERS: Readonly<Record<string, string>> = {};

/** Where a package's tests live, as the shared reader wants it. */
const rootOf = (item: Library): string => join(workspaceRoot, item.root);

const manifestOf = (item: Library): string =>
  join(rootOf(item), 'package.json');

/** Every export of every entry point of a package, `default` left out. */
function exportsOf(item: Library): ExportInfo[] {
  return [...readPackageExports(manifestOf(item)).values()]
    .flat()
    .filter((each) => each.name !== 'default');
}

/** What a package's tests state a behaviour under, and what they do not. */
interface Subject {
  /** Callable exports that are not error classes. */
  subjects: string[];
  /** Those of them the package's tests name in no `describe`. */
  unstated: string[];
}

let libraries: Library[];
beforeAll(async () => {
  libraries = (await loadLibraries())(workspaceRoot);
});

function subjects(): Map<string, Subject> {
  const found = new Map<string, Subject>();

  for (const item of libraries) {
    const titles = describedBy(rootOf(item));
    const subject: Subject = { subjects: [], unstated: [] };

    for (const each of exportsOf(item)) {
      if (!each.callable || each.error) continue;
      if (subject.subjects.includes(each.name)) continue;

      subject.subjects.push(each.name);
      if (!titles.has(each.name)) subject.unstated.push(each.name);
    }

    found.set(item.name, subject);
  }

  return found;
}

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('what the tests state', () => {
  it('finds the packages and their callable exports', () => {
    const found = subjects();

    expect(found.size).toBeGreaterThan(0);
    expect(found.get('@nexusdi/core')?.subjects).toContain('defineModule');
    expect(found.get('@nexusdi/testing')?.subjects).toContain(
      'createTestingContainer',
    );
  });

  it('gives every non-error callable export a `describe` naming it', () => {
    const failures: string[] = [];

    for (const [name, subject] of subjects()) {
      for (const symbol of subject.unstated) {
        if (`${name}: ${symbol}` in ACCEPTED) continue;
        failures.push(
          `${name} exports \`${symbol}\`, which no \`describe\` in its tests ` +
            'names exactly, so its reference entry lists no behaviour. Wrap ' +
            `the cases that are about it in \`describe('${symbol}', …)\`, at ` +
            'any depth. Renaming an existing `describe` is enough; no ' +
            'assertion moves.',
        );
      }
    }

    expect(sorted(failures)).toEqual([]);
  });

  it('declares every callable export inside its own package', () => {
    const failures: string[] = [];

    for (const item of libraries) {
      const src = `${join(rootOf(item), 'src')}${sep}`;
      const callable = new Set(
        exportsOf(item)
          .filter((each) => each.callable)
          .map((each) => each.name),
      );

      for (const declared of [
        ...readDeclarationFiles(manifestOf(item)).values(),
      ].flat()) {
        if (!callable.has(declared.name)) continue;
        if (declared.declaredIn?.startsWith(src)) continue;
        failures.push(
          `${item.name} exports \`${declared.name}\`, declared in ` +
            `${declared.declaredIn ?? 'no file'}, outside ${item.root}/src. ` +
            "The rule above asks the package's own tests to state its " +
            'behaviour, so a re-exported callable needs the rule to learn ' +
            'which package declares it.',
        );
      }
    }

    expect(sorted(failures)).toEqual([]);
  });

  it('nests no `describe` naming an export inside one naming another', () => {
    const failures = new Set<string>();

    for (const item of libraries) {
      // Every published name, types and error classes included, because an
      // entry exists for each of them.
      const published = new Set(exportsOf(item).map((each) => each.name));

      for (const { chain } of behavioursOf(rootOf(item)).chains) {
        const named = chain.filter((segment) => published.has(segment));
        if (named.length < 2) continue;

        failures.add(
          `${item.name} nests \`describe('${named[1]}')\` inside ` +
            `\`describe('${named[0]}')\`, so ${named[1]}'s sentences render ` +
            `on ${named[0]}'s entry as well as their own, labelled with an ` +
            'export name beside the conditions the suite wrote. Promote the ' +
            'inner block to the top level; no assertion moves.',
        );
      }
    }

    expect(sorted([...failures])).toEqual([]);
  });

  /**
   * A case on an export's rail is a sentence about that export, and a reader
   * opens it to see the export used. A case that calls an internal function
   * (`readProvider`, `moduleInternals`, `startBlueprint`) shows the reader a
   * name the package does not publish. So a case under a `describe` naming an
   * export uses the package's public surface, and a white-box case sits under
   * a `describe` named after the internal function it exercises, which keeps
   * it off every rail.
   */
  it("reaches no unexported src name from a case on an export's rail", () => {
    const failures: string[] = [];

    for (const item of libraries) {
      const src = `${join(rootOf(item), 'src')}${sep}`;
      const published = new Set(exportsOf(item).map((each) => each.name));

      for (const { chain, file, line, body } of behavioursOf(rootOf(item))
        .chains) {
        const owner = chain.find((segment) => published.has(segment));
        if (owner === undefined) continue;

        const used = whiteBoxNames(file, body, src, published).filter(
          (name) => !(`${item.name}: ${name}` in HELPERS),
        );
        if (used.length === 0) continue;

        failures.push(
          `${file.slice(workspaceRoot.length + 1)}:${line} sits on ` +
            `${owner}'s rail and uses ${used.join(', ')}, which ` +
            `${item.name} does not export. Restate the case through the ` +
            'public surface, or move it under a `describe` named after the ' +
            'internal function it exercises; no assertion moves.',
        );
      }
    }

    expect(sorted(failures)).toEqual([]);
  });

  /**
   * The exemption list is for a name the convention cannot apply to, so an
   * entry naming a package that no longer publishes it, or one whose tests now
   * state it, is a rule somebody stopped needing and nobody removed.
   */
  it('accepts no name that is stated after all', () => {
    const found = subjects();
    const failures: string[] = [];

    for (const key of Object.keys(ACCEPTED)) {
      const [name, symbol] = key.split(': ');
      const subject = name === undefined ? undefined : found.get(name);
      if (!subject || symbol === undefined) {
        failures.push(
          `doc-behaviour.test.ts accepts "${key}", which names no library. ` +
            'Remove the entry.',
        );
        continue;
      }
      if (!subject.unstated.includes(symbol)) {
        failures.push(
          `${name} now states a behaviour under \`${symbol}\`. Remove the ` +
            'entry from ACCEPTED in doc-behaviour.test.ts.',
        );
      }
    }

    expect(sorted(failures)).toEqual([]);
  });
});
