import { describe, expect, it } from 'vitest';

import { HELM_RECORD } from './helm-record';

describe('HELM_RECORD', () => {
  it('starts the helm at rest on heading 0', () => {
    expect(HELM_RECORD).toStrictEqual({
      records: { helm: { attitude: 0, rate: 0, torque: 0 } },
      setpoints: { helm: { heading: 0 } },
    });
  });
});
