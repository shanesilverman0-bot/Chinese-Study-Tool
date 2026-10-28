import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Build output goes to /dist (docs/ holds design docs and must never be emptied).
// GitHub Actions uploads dist/ to Pages.
// base './' makes asset paths relative, which works for project pages
// hosted at https://<user>.github.io/<repo>/ without extra config.
// `--mode phone` serves over https (self-signed) so the iPhone gets mic access.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
