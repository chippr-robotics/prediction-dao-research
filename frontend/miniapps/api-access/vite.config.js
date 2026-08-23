/**
 * API Access — the member developer console for the FairWins member API (spec 095).
 *
 * THIS PACKAGE CANNOT SIGN, AND THAT IS THE POINT. The host object carries no signer and no
 * `signTypedData`, so a curated third-party package can never mint a capability token. Minting and
 * revoking a key therefore live in the HOST app (Settings → API access), and this console's job is
 * everything that surrounds a key: reading the API's own description, introspecting a token the
 * member already holds, trying a read, and writing an MCP client config. The "Create or revoke
 * keys" card deep-links into the host rather than pretending to offer the flow.
 *
 * It also cannot read configuration. `envPrefix` makes every `import.meta.env` read `undefined`
 * inside a package, and nothing on the host object supplies an arbitrary service URL — so the API
 * base URL is asked of the MEMBER and remembered in the app's own namespaced store. That is the
 * whole reason `store` is declared.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import react from '@vitejs/plugin-react'

import { createMiniAppConfig } from '@fairwins/miniapp-build/index.js'

/**
 * THE version, read from this package's own `package.json` (spec 075, T037).
 *
 * `manifest.version` lives inside the manifest bytes whose `keccak256` is the on-chain
 * MiniAppRegistry commitment; `package.json`'s `version` is what npm, the workspace and any release
 * tooling read. A literal here made those two numbers independent — bumping the workspace version
 * would change no published byte, and bumping this literal would change the on-chain commitment
 * with no `package.json` change to show for it. They agreed only by coincidence.
 *
 * Read at config-evaluation time rather than imported, so no bundler behaviour (import attributes,
 * JSON interop, `envPrefix`) sits between the file and the value.
 */
const { version } = JSON.parse(readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf8'))

export default createMiniAppConfig({
  appId: 'api-access',
  // Load-bearing: the on-chain listing name folds to this app's manifest id via `appSlug`, and the
  // loader refuses a launch on a mismatch. "API Access" folds to `api-access`.
  name: 'API Access',
  version,
  root: import.meta.dirname,
  entry: 'src/entry.jsx',
  permissions: [
    'store', // the gateway base URL the member typed — see storeKeys, and note what is NOT there
    'toast', // copy confirmations
    'navigate', // the one deep link into the host: Settings → API access
  ],
  /*
   * ONE key, holding ONE thing: `{ baseUrl }`.
   *
   * The bearer token deliberately has no home here. `store` rides the member's encrypted backup and
   * is documented as app state, never key material — and a token IS a credential, so persisting one
   * would put a bearer secret into a backup blob and into a namespace the member cannot easily see.
   * The token lives in component memory for the life of the mount and is gone when the member
   * leaves, which the UI states out loud rather than leaving them to assume either way.
   */
  storeKeys: ['console'],
  /*
   * No contracts. This console talks to an HTTP gateway over `fetch` and reads nothing on chain, so
   * it declares no contract names and correspondingly does not take the `contracts` permission —
   * `host.contracts()` throws for every name, which is the correct posture for a package that has
   * no business resolving an address.
   */
  contracts: [],
  plugins: [react()],
})
