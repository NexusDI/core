import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Nx loads this file from the workspace root, and reactRouter() finds
  // app/ from the root, so the root is this folder.
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/bridge-console',
  // Vite looks for a tsconfig in parent folders with no stop at the
  // workspace root, so it can leave the git worktree. This names the file.
  tsconfig: './tsconfig.app.json',
  plugins: [tailwindcss(), !process.env.VITEST && reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
