/**
 * Whether core compiles its plugin hook sites. Every build core publishes
 * sets it to true. The dispatch benchmark (spec 17.3) builds core a second
 * time with the value false, so it can bound what the sites cost with no
 * plugin registered. esbuild inlines the constant and drops the dead
 * branches when it minifies, so a bundled app carries no check.
 *
 * Write a guard as `HOOK_SITES && x`, `HOOK_SITES ? x : y` or
 * `if (HOOK_SITES)`. esbuild folds those after it inlines the constant
 * across modules, and leaves `!HOOK_SITES || x` and `if (!HOOK_SITES)` in
 * the bundle as `!!0`.
 *
 * The assertion keeps TypeScript from narrowing the value to `true`, which
 * would mark every guard as an unnecessary condition.
 */
export const HOOK_SITES = true as boolean;
