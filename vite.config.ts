import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages publica em https://USUARIO.github.io/REPOSITORIO/ → base = '/REPOSITORIO/'.
// O workflow define VITE_BASE_PATH automaticamente; localmente usa '/'.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
})
