/**
 * FairWins mini-app build preset (spec 073, tasks T011).
 *
 * `createMiniAppConfig()` returns the Vite config a mini-app package builds
 * with. Every package in the catalog — first-party and vendor alike — is built
 * by this one preset, because the package format is not a convention but a
 * verified contract: the host fetches the bytes, re-hashes them against the
 * on-chain manifest hash, and refuses to execute anything that disagrees
 * (FR-011). A package assembled by hand would have to reproduce that contract
 * exactly; the preset makes it the only outcome.
 *
 * What the preset guarantees about its output:
 * - **One ES module.** Lib mode, `format: 'es'`, inlined dynamic imports, no
 *   hashed file names: the host imports exactly one verified Blob URL (R1), so
 *   there is no second chunk it could fetch unverified.
 * - **No host-owned dependency inside it.** React, ReactDOM, `react/jsx-runtime`,
 *   ethers and the mini-app SDK are rewritten to reads from the host's frozen
 *   shared-module scope (R2, `hostScopePlugin.js`), and the build FAILS if a
 *   copy of any of them reaches the bundle anyway.
 * - **A manifest that describes the real bytes.** `manifest.json` carries the
 *   SHA-256 of every emitted file (`manifestPlugin.js`); `keccak256` of those
 *   manifest bytes is what the vendor submits on-chain.
 *
 * Usage (a package's own `vite.config.js`):
 *
 * ```js
 * import react from '@vitejs/plugin-react'
 * import { createMiniAppConfig } from '../../../tools/miniapp-build/index.js'
 *
 * export default createMiniAppConfig({
 *   appId: 'token-mint',
 *   name: 'Token Mint',
 *   version: '1.0.0',
 *   root: import.meta.dirname,
 *   permissions: ['wallet:submit', 'store', 'audit', 'toast'],
 *   storeKeys: ['drafts'],
 *   contracts: ['tokenFactory'],   // hostApi 2; needs the 'contracts' permission
 *   plugins: [react()]
 * })
 * ```
 *
 * Build + publish with `node scripts/miniapps/publish.js --app <appId>`.
 * Full documentation: `tools/miniapp-build/README.md`.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  APP_ID_PATTERN,
  CONTRACT_NAME_PATTERN,
  ENTRY_FILENAME,
  HOST_PERMISSIONS,
  MAX_DECLARED_CONTRACTS,
  MINIAPP_ENV_PREFIX,
  SHARED_MODULES,
  STORE_KEY_PATTERN,
  STYLE_FILENAME,
  VERSION_PATTERN
} from './constants.js'
import { hostScopePlugin } from './hostScopePlugin.js'
import { manifestPlugin } from './manifestPlugin.js'

/**
 * Source entry candidates, in preference order. Auto-detection keeps a package
 * to one required declaration (its identity) instead of two.
 */
const ENTRY_CANDIDATES = ['src/entry.jsx', 'src/entry.js', 'entry.jsx', 'entry.js']

function fail(message) {
  throw new Error(`[miniapp-build] ${message}`)
}

function resolveEntry(packageRoot, entry) {
  if (entry) {
    const absolute = path.resolve(packageRoot, entry)
    if (!fs.existsSync(absolute)) fail(`entry "${entry}" does not exist under ${packageRoot}`)
    return absolute
  }

  for (const candidate of ENTRY_CANDIDATES) {
    const absolute = path.join(packageRoot, candidate)
    if (fs.existsSync(absolute)) return absolute
  }

  fail(
    `no entry module found in ${packageRoot} (looked for ${ENTRY_CANDIDATES.join(', ')}). ` +
      'Pass an explicit `entry` option.'
  )
}

/**
 * Emitted asset naming. Styles land on a single predictable `style.css` (the
 * manifest lists it and the host injects it scoped under the workspace root);
 * everything else keeps its own name. No content hashes anywhere — the package
 * as a whole is content-addressed by its CID, so per-file hashes in names would
 * only make the manifest harder to read.
 */
function assetFileNames(assetInfo) {
  const source = (assetInfo.names && assetInfo.names[0]) || assetInfo.name || ''
  return source.endsWith('.css') ? STYLE_FILENAME : 'assets/[name][extname]'
}

function validateOptions({ appId, version, permissions, storeKeys, contracts, root }) {
  if (typeof appId !== 'string' || !APP_ID_PATTERN.test(appId)) {
    fail(`appId "${appId}" must match ${APP_ID_PATTERN} — it is also the URL segment, store namespace and audit key`)
  }
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    fail(`version "${version}" must be a semantic version such as "1.0.0"`)
  }
  if (typeof root !== 'string' || root.trim() === '') {
    fail('root is required — pass `import.meta.dirname` from the package\'s vite.config.js')
  }
  if (!Array.isArray(permissions)) fail('permissions must be an array')
  for (const permission of permissions) {
    if (!HOST_PERMISSIONS.includes(permission)) {
      fail(
        `unknown permission "${permission}" — the host context exposes only ${HOST_PERMISSIONS.join(', ')} ` +
          '(specs/073-miniapp-platform/contracts/host-context.md)'
      )
    }
  }
  if (!Array.isArray(storeKeys)) fail('storeKeys must be an array')
  for (const key of storeKeys) {
    if (typeof key !== 'string' || !STORE_KEY_PATTERN.test(key)) {
      fail(`store key "${key}" must match ${STORE_KEY_PATTERN}`)
    }
  }
  // hostApi 2. Unlike storeKeys this is an ACCESS GATE at runtime, so a build
  // that gets it wrong produces an app that is refused mid-flight rather than
  // one that merely under-documents itself — fail here instead.
  if (!Array.isArray(contracts) || contracts.length > MAX_DECLARED_CONTRACTS) {
    fail(`contracts must be an array of at most ${MAX_DECLARED_CONTRACTS} contract names`)
  }
  for (const contractName of contracts) {
    if (typeof contractName !== 'string' || !CONTRACT_NAME_PATTERN.test(contractName)) {
      fail(`contract name "${contractName}" must match ${CONTRACT_NAME_PATTERN}`)
    }
  }
  if (contracts.length > 0 && !permissions.includes('contracts')) {
    fail('declaring `contracts` also requires the "contracts" permission — the host refuses every lookup without it')
  }
}

/**
 * Build the Vite config for one mini-app package.
 *
 * @param {object} options
 * @param {string} options.appId - registry slug (`manifest.id`, `/apps/:appId`, store namespace)
 * @param {string} options.version - display version, e.g. `"1.0.0"`
 * @param {string} options.root - absolute package directory (`import.meta.dirname`)
 * @param {string} [options.name] - display name; defaults to `appId`
 * @param {string} [options.entry] - source entry relative to `root`; auto-detected when omitted
 * @param {string} [options.outDir] - build output; defaults to `<root>/dist`
 * @param {string[]} [options.permissions] - declared host capabilities (subset of HOST_PERMISSIONS)
 * @param {string[]} [options.storeKeys] - declared namespaced-store keys
 * @param {string[]} [options.contracts] - deployment names `host.contracts()` may resolve (hostApi 2)
 * @param {import('vite').PluginOption[]} [options.plugins] - package plugins, e.g. `react()`
 * @param {Array<{specifier: string, package: string, exports?: string[]}>} [options.sharedModules]
 *   Override the host-owned module table; must stay in step with the host scope
 * @param {boolean|string} [options.minify] - Vite `build.minify`; defaults to `true` (Vite 8's
 *   bundled minifier — the pre-8 `'esbuild'` default now requires esbuild installed separately)
 * @param {string} [options.target] - Vite `build.target`; defaults to `'es2022'`
 * @param {Record<string, string>} [options.define] - extra `define` entries
 * @returns {import('vite').UserConfig} config for `vite build`
 */
export function createMiniAppConfig(options = {}) {
  const {
    appId,
    version,
    root,
    name = appId,
    entry,
    outDir,
    permissions = [],
    storeKeys = [],
    contracts = [],
    plugins = [],
    sharedModules = SHARED_MODULES,
    minify = true,
    target = 'es2022',
    define = {}
  } = options

  validateOptions({ appId, version, permissions, storeKeys, contracts, root })

  const packageRoot = path.resolve(root)
  const entryPath = resolveEntry(packageRoot, entry)
  const outputDir = outDir ? path.resolve(packageRoot, outDir) : path.join(packageRoot, 'dist')

  return {
    root: packageRoot,

    // Nothing from the build environment may be inlined into published package
    // bytes (see MINIAPP_ENV_PREFIX): mini-apps are configured by the host
    // context at runtime, never by `import.meta.env`.
    envPrefix: MINIAPP_ENV_PREFIX,
    publicDir: false,

    plugins: [hostScopePlugin({ sharedModules }), ...plugins, manifestPlugin({ appId, name, version, permissions, storeKeys, contracts })],

    define: {
      // Bundled pure libraries routinely branch on this; a mini-app package has
      // no Node globals at runtime, so leaving it unreplaced would be a
      // `process is not defined` crash inside the workspace.
      'process.env.NODE_ENV': JSON.stringify('production'),
      ...define
    },

    build: {
      outDir: outputDir,
      // Stale output from a previous build would be hashed into the manifest and
      // served as part of the package — the directory must contain only this build.
      emptyOutDir: true,
      copyPublicDir: false,
      target,
      minify,
      sourcemap: false,
      // One stylesheet the host can inject scoped; per-chunk CSS cannot exist
      // because there is only ever one chunk.
      cssCodeSplit: false,
      lib: {
        entry: entryPath,
        formats: ['es'],
        fileName: () => ENTRY_FILENAME,
        // Lib mode derives the stylesheet name from the package name unless it
        // is given one; mini-app packages need not have a package.json at all,
        // and the manifest/host contract wants a fixed `style.css` regardless.
        cssFileName: path.parse(STYLE_FILENAME).name
      },
      rollupOptions: {
        output: {
          // A single verified module: the host hashes and imports exactly one file.
          // (Vite 8/rolldown spelling of the former `inlineDynamicImports: true`.)
          codeSplitting: false,
          entryFileNames: ENTRY_FILENAME,
          chunkFileNames: '[name].js',
          assetFileNames
        }
      }
    }
  }
}

export {
  APP_ID_PATTERN,
  CONTRACT_NAME_PATTERN,
  ENTRY_FILENAME,
  HOST_API_VERSION,
  HOST_PERMISSIONS,
  HOST_SCOPE_SYMBOL_KEY,
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA,
  MAX_DECLARED_CONTRACTS,
  SHARED_MODULES,
  SHARED_MODULE_SPECIFIERS,
  STYLE_FILENAME
} from './constants.js'
export { hostScopePlugin, sharedDepsFromBundle } from './hostScopePlugin.js'
export { manifestPlugin } from './manifestPlugin.js'
export { buildFileDigests, listPackageFiles, sha256Hex, verifyPackageDigests } from './packageIntegrity.js'
