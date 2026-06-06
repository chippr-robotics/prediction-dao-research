import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Fails a production build if Pinata write credentials are present in the build
// environment. Any VITE_*-prefixed value is inlined into the client bundle in
// cleartext, so a set VITE_PINATA_* would publish the Pinata secret to every visitor.
// Production IPFS uploads use the server-side /api/pinata proxy (nginx.conf.template),
// which injects the JWT at container runtime — it must never reach the browser build.
// See the SECURITY note in frontend/.env.example.
function pinataSecretGuard() {
  return {
    name: 'pinata-secret-guard',
    config(_config, { command, mode }) {
      if (command !== 'build' || mode !== 'production') return
      const env = loadEnv(mode, process.cwd(), '')
      const leaked = ['VITE_PINATA_JWT', 'VITE_PINATA_API_KEY', 'VITE_PINATA_API_SECRET']
        .filter((key) => (env[key] || '').trim() !== '')
      if (leaked.length > 0) {
        throw new Error(
          `[security] Refusing to build: ${leaked.join(', ')} set in build env. ` +
          'These VITE_* vars are inlined into the client bundle in cleartext. ' +
          'Remove them — production uploads use the server-side /api/pinata proxy ' +
          '(JWT injected at container runtime, never at build time).'
        )
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pinataSecretGuard()],
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
        'cypress.config.js'
      ]
    }
  }
})
