import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['studyspace-monitor.svg'],
      manifest: {
        name: 'Studyspace Monitor',
        short_name: 'Studyspace',
        description: 'Studyspace teacher and administrator workspace.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'any',
        start_url: '/studyspace-monitor/',
        scope: '/studyspace-monitor/',
        icons: [{ src: '/studyspace-monitor/studyspace-monitor.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        navigateFallback: '/studyspace-monitor/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,mjs,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
  base: '/studyspace-monitor/',
})
