/**
 * Token Mint — the first first-party feature delivered as a mini-app package
 * (spec 073, task T026).
 *
 * The preset externalizes `react`, `react-dom`, `react/jsx-runtime`, `ethers`
 * and `@fairwins/miniapp-sdk` to the host's frozen shared scope; everything
 * else this package imports is bundled into it. That is why the tree carries
 * its own `tokenFactoryAbi.js` and `useClipboard.js`: both are pure data and
 * pure logic with no host state, no React context identity and no singleton
 * requirement, so a copy is safe. Nothing else from `frontend/src/` may be
 * imported — a bundled copy of a host context is a DIFFERENT context.
 */

import react from '@vitejs/plugin-react'

import { createMiniAppConfig } from '@fairwins/miniapp-build/index.js'

export default createMiniAppConfig({
  appId: 'token-mint',
  name: 'Token Mint',
  version: '1.0.0',
  root: import.meta.dirname,
  entry: 'src/entry.jsx',
  permissions: [
    'wallet:submit', // create + every admin action
    'toast',
    'contracts', // resolve `tokenFactory` per chain (hostApi 2)
    'network', // explorer links, network names, the subgraph endpoint
  ],
  // Declared but unused today: this package keeps no client state of its own —
  // every list it renders is read from the chain or the index. Listing a
  // storeKey it never writes would over-declare to a reviewer.
  storeKeys: [],
  /*
   * THE ACCESS GATE, and the whole of it. `host.contracts()` refuses any name
   * absent from this list, so what a curator approves in the manifest is
   * exactly what the package can resolve at runtime. One line to review
   * instead of a bundled address table.
   */
  contracts: ['tokenFactory'],
  plugins: [react()],
})
