import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps every URL relative, so the same build works at
// https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Pocket Chess',
        short_name: 'Chess',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        background_color: '#161512',
        theme_color: '#161512',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Precache everything the app needs so it works offline after first load.
        globPatterns: ['**/*.{js,css,html,png,svg,json,wasm}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024, // room for Stockfish later
        navigateFallback: 'index.html',
      },
    }),
  ],
});
