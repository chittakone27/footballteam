import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the build works when served from a GitHub Pages
  // project subpath (https://<user>.github.io/<repo>/).
  base: './',
})
