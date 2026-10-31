/**
 * The painted ship art as Next's static imports give it: the `*.avif` and
 * `*.webp` modules of `next/image-types/global`, which `next-env.d.ts` also
 * references but which a fresh checkout has not generated. One wildcard is all
 * a module pattern may hold, so the reference is how every art import types.
 */
/// <reference types="next/image-types/global" />
