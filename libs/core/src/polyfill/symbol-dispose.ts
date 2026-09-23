// Node 22 and later define both symbols; browser support is uneven. This
// matches TypeScript's documented shim. runtime/ imports it, so it loads with
// any use of Nexus.
(Symbol as { dispose?: symbol }).dispose ??= Symbol.for('Symbol.dispose');
(Symbol as { asyncDispose?: symbol }).asyncDispose ??= Symbol.for(
  'Symbol.asyncDispose',
);
