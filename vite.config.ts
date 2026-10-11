import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/vision-api': {
          target: env.VITE_API_TARGET || 'http://0.0.0.0:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/vision-api/, ''),
        },
      },
    },
  }
})