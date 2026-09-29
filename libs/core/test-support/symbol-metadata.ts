// Core ships no Symbol.metadata polyfill; @nexusdi/decorators does. Tests
// that hand-write class metadata import this copy, so Symbol.metadata exists
// under Node versions that do not define it.
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata');
