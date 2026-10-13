import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo (npm run dev) los pedidos a /api se reenvían a la API de Node
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
