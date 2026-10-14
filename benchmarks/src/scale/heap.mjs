/**
 * Retained heap of a v8.getHeapSpaceStatistics() reading (scale spec 6.1):
 * the sum of `space_used_size` over every space but the code spaces, in
 * bytes. The code spaces hold compiled code, which differs between runs of
 * the same app with the JIT's timing.
 */
const CODE_SPACES = new Set(['code_space', 'code_large_object_space']);

export function retainedHeap(spaces) {
  let total = 0;
  for (const s of spaces)
    if (!CODE_SPACES.has(s.space_name)) total += s.space_used_size;
  return total;
}
