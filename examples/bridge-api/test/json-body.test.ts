import { describe, expect, it } from 'vitest';

import { readJson } from '../src/bridge/json-body';

describe('readJson', () => {
  it('parses a body sent as application/json', () => {
    expect(readJson('application/json', '{ "ticks": 3 }')).toEqual({
      ticks: 3,
    });
    expect(readJson('application/json', '5')).toBe(5);
  });

  it('reads the media type without its parameters and its case', () => {
    expect(readJson('Application/JSON; charset=utf-8', '{"a":1}')).toEqual({
      a: 1,
    });
    expect(readJson(' application/json ;charset=utf-8', '[]')).toEqual([]);
  });

  it('yields undefined for a body it cannot parse', () => {
    expect(readJson('application/json', '{ ticks')).toBeUndefined();
    expect(readJson('application/json', '')).toBeUndefined();
    expect(readJson('application/json', undefined)).toBeUndefined();
  });

  it('yields undefined for any other media type', () => {
    expect(readJson('text/plain', '{"a":1}')).toBeUndefined();
    expect(readJson('application/x-www-form-urlencoded', 'a=1')).toBeUndefined();
    expect(readJson('application/json-patch+json', '{}')).toBeUndefined();
    expect(readJson(undefined, '{"a":1}')).toBeUndefined();
  });
});
