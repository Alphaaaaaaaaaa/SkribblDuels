import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'apps/gateway/src/index.ts',
    target: 'node24',
    sourcemap: true,
    outDir: 'dist/gateway',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js'
      }
    }
  }
});
