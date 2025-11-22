import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoBase = '/sudoku/';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? repoBase : '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 7203,
    strictPort: true,
    allowedHosts: ['hoangch-virt.dev.itim.vn'],
  },
  preview: {
    host: '0.0.0.0',
    port: 7203,
    strictPort: true,
    allowedHosts: ['hoangch-virt.dev.itim.vn'],
  },
}));
