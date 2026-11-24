import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages publica em https://USUARIO.github.io/REPOSITORIO/ → base = '/REPOSITORIO/'.
// O workflow define VITE_BASE_PATH automaticamente; localmente usa '/'.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
  // atalho "Abrir TESTE": a cópia local é atualizada por fora (robocopy); a varredura garante que o site recarregue
  server: process.env.ENGEFRIL_POLLING || process.cwd().includes('engefril-tpe-teste') ? { watch: { usePolling: true, interval: 800 } } : undefined,
})
