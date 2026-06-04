import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build output goes to /docs so GitHub Pages can serve it directly.
// base './' makes asset paths relative, which works for project pages
// hosted at https://<user>.github.io/<repo>/ without extra config.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
