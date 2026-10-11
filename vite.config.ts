import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // this is attempt proxy stuff joy has added
  server: {
    proxy: {
      '/vision-api': {
        target: 'http://0.0.0.0:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vision-api/, ''),
      },
    },
  },
})
