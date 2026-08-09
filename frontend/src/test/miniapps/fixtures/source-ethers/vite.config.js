/**
 * Build config for the committed ethers fixture package (spec 075, task T033).
 *
 * Same preset, same defaults, same regeneration harness as `../source/` — see
 * that file for why a fixture is built by the REAL `createMiniAppConfig()`
 * rather than synthesized. The only difference is what the app imports, and
 * that difference is the point: this package's `entry.js` carries the ~190-name
 * ethers host-scope shim, so the committed bytes are sensitive to how `ethers`
 * resolves on disk (`hostScopePlugin.js#discoverExports`).
 *
 * Regenerate with `node frontend/src/test/miniapps/fixtures/regenerate.mjs`,
 * which builds this package and `../source/` together.
 */

import react from '@vitejs/plugin-react'

import { createMiniAppConfig } from '@fairwins/miniapp-build/index.js'

export default createMiniAppConfig({
  appId: 'fixture-ethers',
  name: 'Ethers Fixture Mini-App',
  version: '1.0.0',
  root: import.meta.dirname,
  entry: 'src/entry.jsx',
  // One capability, and one the app genuinely could use, so the manifest still
  // cannot pass by declaring everything. `contracts` is deliberately absent:
  // reaching a contract is what a package would need ethers FOR, and leaving it
  // undeclared keeps this fixture about the shim rather than about the host API.
  permissions: ['toast'],
  storeKeys: [],
  plugins: [react()]
  // Every other option is left at the preset's default ON PURPOSE, including
  // minification — a fixture built with non-default settings would be a weaker
  // guard than one built the way real packages are built.
})
