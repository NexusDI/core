/**
 * The hero art as Next's static imports give it. The pattern is narrower than
 * `next/image-types/global`, which declares `*.avif` and `*.webp` only where
 * `next-env.d.ts` exists, so the typecheck needs no generated file.
 */
declare module '*/hero/*.avif' {
  const image: { src: string; width: number; height: number };
  export default image;
}
declare module '*/hero/*.webp' {
  const image: { src: string; width: number; height: number };
  export default image;
}
