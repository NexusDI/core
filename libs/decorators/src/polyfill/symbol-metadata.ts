// TypeScript and esbuild hand decorators a `context.metadata` object only
// when Symbol.metadata exists while the class evaluates. No engine defines it
// yet. The decorator modules import this file; nothing else in the package does.
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata');
