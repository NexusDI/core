import { isDeepStrictEqual } from 'node:util';

import type { Outcome } from './schema.ts';

const RANK: Record<Outcome, number> = {
  'not-applicable': 0,
  pass: 1,
  'wrong-instance': 2,
  'runtime-error': 3,
  'compile-error': 4,
};
type Section = 'singleton' | 'transient' | 'scoped';
const SECTIONS: readonly Section[] = ['singleton', 'transient', 'scoped'];

export function classify(
  printed: Record<string, unknown> | null,
  buildError: string | null,
  golden: Record<Section, unknown>,
) {
  if (buildError !== null || printed === null || 'load' in printed) {
    const message = buildError ?? String(printed?.load ?? 'no output');
    return {
      sections: {
        singleton: 'compile-error',
        transient: 'compile-error',
        scoped: 'compile-error',
      } as Record<Section, Outcome>,
      outcome: 'compile-error' as Outcome,
      message,
    };
  }
  const sections = {} as Record<Section, Outcome>;
  let message: string | undefined;
  for (const s of SECTIONS) {
    const v = printed[s];
    if (v === 'not-applicable') sections[s] = 'not-applicable';
    else if (typeof v === 'object' && v !== null && 'error' in v) {
      sections[s] = 'runtime-error';
      message ??= String((v as { error: unknown }).error);
    } else
      sections[s] = isDeepStrictEqual(v, golden[s]) ? 'pass' : 'wrong-instance';
  }
  const outcome = SECTIONS.map((s) => sections[s]).reduce(
    (a, b) => (RANK[b] > RANK[a] ? b : a),
    'not-applicable' as Outcome,
  );
  return message === undefined
    ? { sections, outcome }
    : { sections, outcome, message };
}

const SCALE_CHECKS = ['digest', 'shared', 'built', 'kinds', 'ids'] as const;

/**
 * The outcome of one scale cell from the line verify-child.mjs printed
 * (scale spec section 5). A scale graph holds singletons only, so the line
 * is classify's singleton section and the other two are not applicable: a
 * load failure, a build error and a thrown error rank as the matrix ranks
 * them. A wrong-instance names the checks that failed. An app that declares
 * another count, target or entries than the model is a wrong-instance too:
 * the harness renderer is at fault, not the library.
 */
export function classifyScale(
  printed: Record<string, unknown> | null,
  buildError: string | null,
  expectedDigest: string,
): { outcome: Outcome; message?: string } {
  const want = {
    digest: expectedDigest,
    shared: true,
    built: true,
    kinds: true,
    ids: true,
  };
  if (buildError === null && printed !== null && 'declared' in printed)
    return { outcome: 'wrong-instance', message: String(printed.declared) };
  const sections =
    printed === null || 'load' in printed
      ? printed
      : {
          singleton: printed,
          transient: 'not-applicable',
          scoped: 'not-applicable',
        };
  const { outcome, message } = classify(sections, buildError, {
    singleton: want,
    transient: null,
    scoped: null,
  });
  if (outcome !== 'wrong-instance')
    return message === undefined ? { outcome } : { outcome, message };
  const failed = SCALE_CHECKS.filter((k) => printed?.[k] !== want[k]);
  return { outcome, message: failed.join(', ') };
}
