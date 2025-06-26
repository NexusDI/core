import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import { benchmarkGenerator } from './benchmark';
import { BenchmarkGeneratorSchema } from './schema';

describe('benchmark generator', () => {
  let tree: Tree;
  const options: BenchmarkGeneratorSchema = { name: 'test' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await benchmarkGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test');
    expect(config).toBeDefined();
  });
});
