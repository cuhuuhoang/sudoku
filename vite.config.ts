import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repoBase = '/sudoku/';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? repoBase : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: [
        'favicon.svg',
        'favicon.png',
        'favicon-32.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
      ],
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      manifest: {
        name: 'Sudoku Trainer',
        short_name: 'Sudoku',
        start_url: repoBase,
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
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
