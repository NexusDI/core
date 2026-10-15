/** Whether `reported`, the output of `<leg> --version`, names exactly the `pinned` version. */
export function reportsPin(
  leg: 'deno' | 'bun',
  reported: string,
  pinned: string,
): boolean;
