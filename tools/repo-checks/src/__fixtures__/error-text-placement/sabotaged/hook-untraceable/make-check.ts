import { cacheMiss } from './errors.js';

export const makeCheck =
  () =>
  (_view: unknown, report: (error: unknown) => void): void =>
    report(cacheMiss('root'));
