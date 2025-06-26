import { Tree, formatFiles, generateFiles, names } from '@nx/devkit';
import { BenchmarkGeneratorSchema } from './schema';
import * as path from 'path';

export default async function (tree: Tree, options: BenchmarkGeneratorSchema) {
  const libNames = names(options.name);
  const projectRoot = `benchmarks/${libNames.fileName}`;
  const srcRoot = `${projectRoot}/src`;

  // 1. Check if project already exists
  if (tree.exists(`${projectRoot}/project.json`)) {
    throw new Error(
      `Benchmark project '${options.name}' already exists at ${projectRoot}`
    );
  }

  // 2. Generate index.benchmark.ts from template
  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, {
    tmpl: '',
    name: libNames.fileName,
    className: libNames.className,
    propertyName: libNames.propertyName,
  });

  // 2b. Generate package.json and tsconfig.json from templates
  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, {
    tmpl: '',
    name: libNames.fileName,
    className: libNames.className,
    propertyName: libNames.propertyName,
  });

  // 3. Create project.json
  const projectJson = {
    name: `benchmarks-${libNames.fileName}`,
    root: projectRoot,
    sourceRoot: srcRoot,
    projectType: 'library',
    tags: ['benchmark'],
    targets: {
      benchmark: {
        executor: 'tools/benchmark:benchmark',
        options: {
          main: `${srcRoot}/index.benchmark.ts`,
        },
      },
    },
  };
  tree.write(
    `${projectRoot}/project.json`,
    JSON.stringify(projectJson, null, 2)
  );

  // 4. Optionally, create a README.md
  const readme = `# ${libNames.className} Benchmark

This benchmark tests the performance of the ${libNames.className} DI library.

- Edit \`src/index.benchmark.ts\` to add your benchmark code.
- Run the benchmark with:

    nx run benchmarks-${libNames.fileName}:benchmark
`;
  tree.write(`${projectRoot}/README.md`, readme);

  // 5. Register the project in workspace (optional, Nx will auto-discover)

  await formatFiles(tree);
}
