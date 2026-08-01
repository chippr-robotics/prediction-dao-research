# `@fairwins/miniapp-build`

The shared Vite preset every FairWins mini-app package is built with (spec 073, task T011).

Using it is not a convention — it is how a package comes out in the shape the host will
accept. The host fetches your bytes, re-hashes them against the manifest hash recorded
on-chain, and refuses to execute anything that disagrees (FR-011). The preset makes that
outcome the only one you can produce.

## What the preset guarantees

- **One ES module.** Lib mode, `format: 'es'`, inlined dynamic imports, unhashed file
  names. The host imports exactly one verified Blob URL (research R1), so there is no
  second chunk it could fetch unverified.
- **No host-owned dependency inside the bundle.** `react`, `react-dom`,
  `react/jsx-runtime`, `ethers`, and `@fairwins/miniapp-sdk` are rewritten to reads from
  the host's frozen shared-module scope (research R2), and the build **fails** if a copy
  of one reaches the bundle anyway. Two React copies cannot share one tree, so this is a
  correctness requirement, not a size optimization.
- **A manifest that describes the real bytes.** `manifest.json` carries the SHA-256 of
  every emitted file; `keccak256` of those manifest bytes is what the vendor submits
  on-chain as `manifestHash`.

## Usage

A package lives at `frontend/miniapps/<appId>/` with its own `vite.config.js`:

```js
import react from '@vitejs/plugin-react'
import { createMiniAppConfig } from '../../../tools/miniapp-build/index.js'

export default createMiniAppConfig({
  appId: 'token-mint',        // stable slug; must match the manifest id the host expects
  name: 'Token Mint',
  version: '1.0.0',
  root: import.meta.dirname,
  entry: 'src/entry.jsx',     // default-exports the mounted React component
  permissions: ['wallet:submit', 'store', 'audit', 'toast'],
  storeKeys: ['drafts'],      // declared shared-state keys (namespaced by appId at runtime)
  plugins: [react()],
})
```

Your entry module receives the host context — see
`specs/073-miniapp-platform/contracts/host-context.md` for the full `hostApi: 1` surface.
Import `react`/`ethers` normally; the preset routes them to the host's singletons.

## Building and publishing

```bash
node scripts/miniapps/publish.js --app token-mint          # build + pin, prints CID + manifestHash
node scripts/miniapps/publish.js --app token-mint --dev    # build + stage locally for the dev gateway
```

Submit the printed `cid` and `manifestHash` to the registry (`submitApp` for a new
listing, `submitUpdate` for a version). The listing lands **Pending**; the previously
approved package keeps serving until a curator promotes yours.

## Verifying a build by hand

```bash
cd frontend/miniapps/<appId> && ../../node_modules/.bin/vite build
node -e "
const c=require('node:crypto'), fs=require('node:fs')
const m=JSON.parse(fs.readFileSync('dist/manifest.json','utf8'))
for (const [p, meta] of Object.entries(m.files)) {
  const real = c.createHash('sha256').update(fs.readFileSync('dist/'+p)).digest('hex')
  console.log(p, real === meta.sha256 ? 'OK' : 'MISMATCH')
}"
```

A mismatch here means the host would refuse the package — fix the build before submitting.

## Files

| File | Role |
|---|---|
| `index.js` | `createMiniAppConfig()` — the preset factory |
| `hostScopePlugin.js` | rewrites shared deps to host-scope reads; fails the build on a leaked copy |
| `manifestPlugin.js` | emits `manifest.json` with real per-file SHA-256 digests |
| `packageIntegrity.js` | hashing helpers shared by the plugins and the publish script |
| `constants.js` | shared-dep list, manifest schema id, `hostApi` version |
