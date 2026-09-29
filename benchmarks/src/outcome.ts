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
