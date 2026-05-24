import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          web3: ['ethers', 'wagmi', 'viem']
        }
      }
    }
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    exclude: [
      'node_modules/**',
      'dist/**',
      'cypress/**',
      '**/useIpfs.test.js'
    ],
    env: {
      NODE_ENV: 'test',
      VITE_SKIP_BLOCKCHAIN_CALLS: 'true',
      // Tests assert against the Mordor deployment (chain 63) since Amoy
      // addresses are populated only after deployment. Override the .env
      // VITE_NETWORK_ID=80002 setting for test runs.
      VITE_NETWORK_ID: '63'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '*.config.js',
        'dist/',
        'cypress/',
        'cypress.config.js',
        'src/**/index.js',
        'src/legacy/**',
        'src/assets/**',
        'src/main.jsx',
        'src/App.jsx',
        'src/wagmi.js',
        'src/thirdweb.js',
        'src/ipfs.js'
      ]
    }
  }
})
