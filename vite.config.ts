import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
});
