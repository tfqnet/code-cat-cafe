import { defineConfig } from 'vite';

const bridge = `http://localhost:${process.env.CAFE_PORT || 4777}`;

export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    // In dev mode the page runs on Vite; pass event requests through to the bridge.
    proxy: { '/events': bridge, '/recent': bridge, '/hook': bridge },
  },
});
