/**
 * `value` with `digits` decimals and a comma between each group of three
 * integer digits. The ship's reading arrives rounded to four significant
 * digits, and a figure such as 0.003188 still carries more decimals than its
 * gauge shows, so every gauge on the console writes its figure through this.
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

/**
 * `radians` as a bearing in degrees in [0, 360), to 0.1, with the unit. The
 * angle rounds to 0.1 degrees before it folds, so a hair below zero reads
 * 0.0° and never 360.0°.
 */
export function bearing(radians: number): string {
  const tenths = Math.round(((radians * 180) / Math.PI) * 10) / 10;
  return `${fixed(((tenths % 360) + 360) % 360, 1)}°`;
}

/** `radiansPerSecond` in °/s to two decimals, with the unit. It never prints `-0.00`. */
export function turnRate(radiansPerSecond: number): string {
  const text = fixed((radiansPerSecond * 180) / Math.PI, 2);
  return `${text === '-0.00' ? '0.00' : text} °/s`;
}
