/**
 * The V8 flags of the K14 workers (benchmarks spec 14.6, issue #206).
 *
 * Core's get path uses all of TurboFan's cumulative inlining budget
 * (--max-inlined-bytecode-size-cumulative, 920 bytecodes by default). At that
 * budget V8 inlines different callees after an edit anywhere on the path, and
 * get-50 moves by 10 to 15% in either direction, which hides a hook-site cost
 * below that. With the budget raised, the on and off builds inline the same
 * callees on the get path except the hook sites, so K14 measures what the
 * hook sites execute.
 *
 * 4600 is V8's --max-inlined-bytecode-size-absolute default, the largest
 * value that changes anything. Node exits with `bad option` on a flag V8 no
 * longer has, so a Node upgrade that drops it fails the job.
 *
 * Only the get cases take the flag. The create and lazy-read paths stay under
 * the default budget, and the flag reshapes which callees each build inlines
 * there (create-2000 and lazy-read-50 read above their default range on a
 * runner with it).
 *
 * Only libs/core/bench uses this. The published benchmarks run at V8
 * defaults, and bench-kit's forkWorker keeps its own default.
 */
export function execArgvFor(name) {
  return name.startsWith('get-')
    ? ['--expose-gc', '--max-inlined-bytecode-size-cumulative=4600']
    : ['--expose-gc'];
}
