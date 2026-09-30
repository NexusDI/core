import { describe, expectTypeOf, it } from 'vitest';

import type { CheckOptions, ErrorTextPack } from '@nexusdi/core';

import { fuelLineNotes } from '../test-support/third-party-annotator.js';
import {
  devtools,
  inspect,
  type GraphAnnotator,
  type GraphNote,
  type InspectOptions,
} from './index.js';

describe('devtools', () => {
  it('takes a third-party annotator that matches GraphAnnotator by shape', () => {
    expectTypeOf(fuelLineNotes).toExtend<GraphAnnotator>();
    devtools({ annotate: [fuelLineNotes] });
  });

  it('names a provider id and a label in each note', () => {
    expectTypeOf<GraphNote>().toEqualTypeOf<{
      readonly provider: string;
      readonly label: string;
    }>();
  });
});

describe('inspect', () => {
  it("takes Nexus.check's options plus text and annotate", () => {
    expectTypeOf<InspectOptions>().toEqualTypeOf<
      CheckOptions & {
        readonly text?: readonly ErrorTextPack[];
        readonly annotate?: readonly GraphAnnotator[];
      }
    >();
    expectTypeOf(inspect)
      .parameter(1)
      .toEqualTypeOf<InspectOptions | undefined>();
    inspect([], { annotate: [fuelLineNotes] });
  });
});
