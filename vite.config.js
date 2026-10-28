import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build output goes to /dist (docs/ holds design docs and must never be emptied).
// GitHub Actions uploads dist/ to Pages.
// base './' makes asset paths relative, which works for project pages
// hosted at https://<user>.github.io/<repo>/ without extra config.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
