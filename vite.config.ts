import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: false },
    },
  },
  preview: { port: 4173 },
});
