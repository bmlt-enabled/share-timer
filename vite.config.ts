/// <reference types="vitest/config" />

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@tests': resolve(__dirname, 'src/tests'),
      '@types': resolve(__dirname, 'src/types'),
      '@assets': resolve(__dirname, 'src/assets')
    }
  },
  plugins: [
    tailwindcss(),
    svelte(),
    svelteTesting(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'timer.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Share Timer',
        short_name: 'Share Timer',
        description: 'A share timer for 12-step meetings',
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    include: ['src/**/*.{test,spec}.{js,ts}']
  },
  build: {
    chunkSizeWarningLimit: 1000
  }
});
