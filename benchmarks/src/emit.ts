/** What tsc emits for scale-200 (spec 4.9 emit rows): bytes, helper calls and the imports it kept. */
export function countEmit(
  files: readonly { path: string; text: string }[],
  sourceImports: number,
) {
  let emittedBytes = 0,
    metadataCalls = 0,
    decorateCalls = 0,
    importsKept = 0;
  for (const { text } of files) {
    emittedBytes += Buffer.byteLength(text);
    metadataCalls += text.split('__metadata(').length - 1;
    decorateCalls += text.split('__decorate(').length - 1;
    importsKept += (text.match(/^import\s/gm) ?? []).length;
  }
  return {
    emittedBytes,
    metadataCalls,
    decorateCalls,
    importsInSource: sourceImports,
    importsKept,
  };
}
