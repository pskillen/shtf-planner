import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  server: { port: 5173, strictPort: true },
  preview: { port: Number(process.env.PREVIEW_PORT ?? 4173), strictPort: true },
  build: { target: 'esnext' },
});
