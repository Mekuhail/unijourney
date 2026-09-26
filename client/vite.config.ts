import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'motion/react', 'leaflet', '@googlemaps/js-api-loader', 'qrcode.react', 'lucide-react', 'clsx']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
      '/uploads': { target: 'http://localhost:8787', changeOrigin: false }
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/client'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so route chunks stay small and cache well between deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return 'vendor-react';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          return undefined;
        }
      }
    }
  }
});
