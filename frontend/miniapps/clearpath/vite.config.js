/**
 * ClearPath — external-DAO governance, as a mini-app package (spec 073 T028).
 *
 * Unlike Token Mint, this app is NETWORK-AGNOSTIC: it reads DAOs from every chain it can operate
 * on, in parallel, independent of where the wallet sits. That is why it declares `network` (for
 * the chain roster and per-chain descriptors) and why `wallet:submit` alone is not enough — a
 * member viewing a DAO on another chain has to be able to move their wallet there.
 */

import react from '@vitejs/plugin-react'

import { createMiniAppConfig } from '@fairwins/miniapp-build/index.js'

export default createMiniAppConfig({
  appId: 'clearpath',
  name: 'ClearPath',
  version: '1.0.0',
  root: import.meta.dirname,
  entry: 'src/entry.jsx',
  permissions: [
    'wallet:submit', // register, propose, vote, queue, execute
    'toast',
    'store', // device-tracked DAOs, on networks with no on-chain registry
    'contracts', // ExternalDAORegistry / paymentToken / sanctionsGuard, per chain
    'network', // the chain roster, explorer links, network names
  ],
  storeKeys: ['tracked', 'trackedMigratedAt'],
  /*
   * `sanctionsGuard` is declared for a READ only — the app asks whether a platform sanctions
   * source exists on a chain, to decide how much it can say about screening posture. The screening
   * DECISION is the host's, enforced inside `submit`, and this package does not perform it.
   */
  contracts: ['externalDAORegistry', 'paymentToken', 'sanctionsGuard'],
  plugins: [react()],
})
