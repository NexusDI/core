import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Nx loads this file from the workspace root, and reactRouter() finds
  // app/ from the root, so the root is this folder.
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/bridge-console',
  plugins: [tailwindcss(), !process.env.VITEST && reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
