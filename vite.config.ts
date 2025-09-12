import { defineConfig, loadEnv } from 'vite' // Import loadEnv
import path from 'path'; // Import path module
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => { // Add mode parameter
  const env = loadEnv(mode, process.cwd(), ''); // Load all env vars
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3002';

  return {
    root: path.resolve(__dirname), // Explicitly define project root
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      // Polyfill process.env for compatibility
      'process.env': env,
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/auth': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
