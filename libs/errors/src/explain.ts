import {
  BlueprintError,
  type BlueprintView,
  type ErrorText,
  type ErrorTextKit,
  type ErrorTextPack,
  type NexusError,
  type NexusErrorByCode,
} from '@nexusdi/core';
import { coreText, layoutText } from '@nexusdi/core/text';

import { nearMissesOf } from './near-misses.js';

/** What explain() reads besides the error. */
export interface ExplainOptions {
  /** The container's view. Without it, `kit.nearMisses` returns an empty list. */
  readonly view?: BlueprintView;
  /** Text packs, ahead of core's own. An earlier pack wins for the same code. */
  readonly text?: readonly ErrorTextPack[];
}

/** One pack entry, called with the error of any code. */
type AnyEntry = (
  error: NexusError,
  view: BlueprintView | undefined,
  kit: ErrorTextKit,
) => ErrorText | undefined;

/** The kit a pack reads near misses through: a search of `view`, or none without one. */
function kitFor(view: BlueprintView | undefined): ErrorTextKit {
  return {
    nearMisses: (token, moduleId) =>
      view === undefined ? [] : nearMissesOf({ token, moduleId }, view),
  };
}

/** The text of the first entry for `error.code` in `packs` that returns one. */
function fromPacks(
  error: NexusError,
  packs: readonly ErrorTextPack[],
  view: BlueprintView | undefined,
  kit: ErrorTextKit,
): ErrorText | undefined {
  for (const pack of packs) {
    // Object.hasOwn keeps a code named after an Object.prototype key, or an
    // entry a pack inherits, from calling code the pack never listed.
    if (!Object.hasOwn(pack, error.code)) continue;
    const entry = pack[error.code as keyof NexusErrorByCode] as
      AnyEntry | undefined;
    const text = entry?.(error, view, kit);
    if (text !== undefined) return text;
  }
  return undefined;
}

/** The aggregate text, with each inner error rendered through `packs` and indented. */
function blueprintText(
  error: BlueprintError,
  packs: readonly ErrorTextPack[],
  view: BlueprintView | undefined,
  kit: ErrorTextKit,
): ErrorText {
  const count = `${error.errors.length} error${error.errors.length === 1 ? '' : 's'}`;
  const lines = error.errors.map((inner) => {
    const text = fromPacks(inner, packs, view, kit);
    const full =
      text === undefined ? inner.message : layoutText(inner.code, text);
    return `  ${full.split('\n').join('\n    ')}`;
  });
  return {
    message: `the module graph has ${count}; nothing was built.\n${lines.join('\n')}`,
  };
}

/**
 * The text of `error` from the first pack that has some: `options.text` in
 * array order, then core's pack. A BlueprintError no pack words gets the
 * aggregate text, with each inner error rendered through the same packs.
 * Returns undefined for a code no pack covers. With `options.view`, a pack
 * finds near misses through its kit.
 */
export function explain(
  error: NexusError,
  options?: ExplainOptions,
): ErrorText | undefined {
  const view = options?.view;
  const packs = [...(options?.text ?? []), coreText];
  const kit = kitFor(view);
  const text = fromPacks(error, packs, view, kit);
  if (text !== undefined || !(error instanceof BlueprintError)) return text;
  return blueprintText(error, packs, view, kit);
}
