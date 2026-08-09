import process from 'node:process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tenantBrandingPlugin } from './vite-plugins/tenant-branding.js'

/*
 * Build stamp for the nav drawer (see src/config/buildInfo.js for why).
 *
 * Version comes from the ROOT package.json, not frontend's — frontend's is `0.0.0`, a workspace
 * placeholder that is never bumped, so displaying it would be noise dressed as information.
 *
 * The commit arrives as an ENV VAR, not from git: `.dockerignore` excludes `.git`, so the image
 * build genuinely cannot run `git rev-parse`. cloudbuild.yaml passes $SHORT_SHA through as a build
 * arg. Unset (a local dev server) resolves to 'dev', which the drawer displays honestly rather
 * than hiding.
 */
const ROOT_PKG = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
)
const COMMIT_SHA = (process.env.VITE_COMMIT_SHA || '').trim().slice(0, 7) || 'dev'

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
  plugins: [react(), pinataSecretGuard(), tenantBrandingPlugin()],
  // Build-time constants, NOT `import.meta.env`: the preset used for mini-app packages sets an
  // envPrefix that turns any bundled `import.meta.env` read into `undefined`, and a value that is
  // only sometimes present would make the drawer's build label sometimes lie.
  define: {
    __APP_VERSION__: JSON.stringify(ROOT_PKG.version),
    __APP_COMMIT__: JSON.stringify(COMMIT_SHA),
  },
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
      // Spec 073: mini-app packages are built artifacts and their own installs;
      // neither holds tests, and both would be scanned on every run.
      'miniapps/*/dist/**',
      'miniapps/*/node_modules/**',
      '**/useIpfs.test.js'
    ],
    alias: {
      // Spec 073: `@fairwins/miniapp-sdk` is not an npm package — at runtime the
      // build preset rewrites it to a read from the host's shared-module scope.
      // Vitest imports package SOURCE, so the specifier reaches the resolver and
      // needs somewhere to land. Aliased to the REAL hook, so package tests
      // exercise the actual host contract rather than a stub that would drift.
      '@fairwins/miniapp-sdk': fileURLToPath(
        new URL('./src/lib/miniapps/sdkTestShim.js', import.meta.url)
      )
    },
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
