import { describe, expect, it } from 'vitest';

import { orderFor, williams } from './order.ts';

function carryover(rows: number[][], n: number): number[][] {
  const counts = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const row of rows)
    for (let i = 1; i < row.length; i++) counts[row[i - 1]][row[i]]++;
  return counts;
}

describe('williams', () => {
  it.each([2, 4, 6, 11])(
    'puts every item in every position equally for n=%i',
    (n) => {
      const rows = williams(n);
      for (let pos = 0; pos < n; pos++) {
        const seen = rows.map((row) => row[pos]).sort((a, b) => a - b);
        const per = rows.length / n;
        expect(seen).toEqual(
          Array.from({ length: n }, (_, i) => i).flatMap((i) =>
            new Array(per).fill(i),
          ),
        );
      }
    },
  );
  it.each([2, 4, 6, 11])(
    'has every item follow every other equally for n=%i',
    (n) => {
      const counts = carryover(williams(n), n);
      const off = counts.flatMap((row, i) => row.filter((_, j) => j !== i));
      expect(new Set(off).size).toBe(1);
    },
  );
  it('alternates two items', () => {
    expect(williams(2)).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });
});

describe('orderFor', () => {
  it('cycles the rows and relabels them by seed', () => {
    const a = orderFor(0, 4, 1);
    expect([...a].sort()).toEqual([0, 1, 2, 3]);
    expect(orderFor(4, 4, 1)).toEqual(a);
    expect(orderFor(0, 4, 1)).toEqual(orderFor(0, 4, 1));
  });
});
