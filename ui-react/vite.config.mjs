import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The React UI is built at publish time into ui-react/dist and served by `frontdex serve` under /v2/.
// React and its libraries are devDependencies of frontdex: nothing here is installed into the user's app.
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: { proxy: { '/api': 'http://127.0.0.1:4400' } },
});
