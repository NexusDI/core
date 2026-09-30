/**
 * Whether core compiles its plugin hook sites. Every build core publishes
 * sets it to true. The dispatch benchmark (spec 17.3) builds core a second
 * time with the value false, so it can bound what the sites cost with no
 * plugin registered. esbuild inlines the constant and drops the dead
 * branches when it minifies, so a bundled app carries no check.
 *
 * Write a guard as `HOOK_SITES && x`, `HOOK_SITES ? x : y` or
 * `if (HOOK_SITES && x) { ... }`. esbuild inlines the constant across
 * modules and folds the first two, and an `if` whose body is one
 * statement, to the branch that runs. An `if` with a block body stays in the
 * `off` bundle as `if (!1) { ... }`, which never runs, and a negated guard
 * such as `!HOOK_SITES || x` stays as `!!1 || x`. The dispatch completeness test
 * checks the `off` bundle for the condition of every site.
 *
 * The assertion keeps TypeScript from narrowing the value to `true`, which
 * would mark every guard as an unnecessary condition.
 */
export const HOOK_SITES = true as boolean;
