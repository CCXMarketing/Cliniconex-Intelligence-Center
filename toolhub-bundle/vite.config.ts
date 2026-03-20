import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',  // CRITICAL — all asset paths must be relative for ToolHub
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    // Standard SPA output — no lib config, no iife format
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
