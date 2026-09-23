// TypeScript and esbuild hand decorators a `context.metadata` object only
// when Symbol.metadata exists while the class evaluates. No engine defines it
// yet. Only decorators/ imports this file.
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata');
