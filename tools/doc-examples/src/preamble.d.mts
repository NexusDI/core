/**
 * Types for `preamble.mjs`.
 *
 * That module is plain JavaScript for the reason `regions.d.mts` gives: the
 * docs app's MDX loader imports it, and Nx loads that config under Node's
 * native type stripping while building the project graph.
 */

export declare const PREAMBLE_FILE: string;

export declare function readPreamble(packageDir: string): string;

export declare function preamblePath(packageDir: string): string;

export declare function withPreamble(preamble: string, code: string): string;
