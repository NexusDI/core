/**
 * A test preload (node --import): every v8.getHeapSpaceStatistics() read
 * after the first reports 512 MB more in code_space. A heap figure that
 * counts the code spaces moves by that much; one that excludes them does not.
 */
import v8 from 'node:v8';
import { syncBuiltinESMExports } from 'node:module';

const real = v8.getHeapSpaceStatistics;
let reads = 0;
v8.getHeapSpaceStatistics = () => {
  const inflate = reads++ > 0;
  return real().map((s) =>
    inflate && s.space_name === 'code_space'
      ? { ...s, space_used_size: s.space_used_size + 512 * 1024 * 1024 }
      : s,
  );
};
syncBuiltinESMExports();
