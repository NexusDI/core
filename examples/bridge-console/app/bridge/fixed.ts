/**
 * `value` with `digits` decimals and a comma between each group of three
 * integer digits. The ship sends raw floats, such as 0.18000000000000002, so
 * every gauge on the console writes its figure through this.
 */
export function fixed(value: number, digits: number): string {
  const [whole = '', fraction] = value.toFixed(digits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** `pascals` in kPa, to `digits` decimals, with the unit. */
export function kilopascals(pascals: number, digits: number): string {
  return `${fixed(pascals / 1000, digits)} kPa`;
}

/** `watts` in MW, to 0.1, with the unit. */
export function megawatts(watts: number): string {
  return `${fixed(watts / 1e6, 1)} MW`;
}
