# Quickstart: Validating the Mini-App Platform (073)

End-to-end validation scenarios. Shapes/invariants: [data-model.md](./data-model.md);
surfaces: [contracts/](./contracts/).

## Prerequisites

- `npm install` at repo root (and `cd frontend && npm install` if not hoisted).
- Local chain: `npx hardhat node` (chain 1337) in one terminal.

## 1. Contract suite

```bash
npm run compile
npx hardhat test test/miniAppRegistry.test.js test/upgradeable/MiniAppRegistry.upgrade.test.js
npm run check:storage-layout
```

Expected: lifecycle transitions per data-model (submit→Pending, approve promotes
proposed→approved, update leaves approved serving, suspend reversible, deprecate
terminal), role reverts (`AccessControlUnauthorizedAccount`), duplicate-name and
bounded-string reverts, upgrade preserves state, storage-layout gate green.

## 2. Deploy + sync (local)

```bash
npx hardhat run scripts/deploy/deploy-miniapp-registry.js --network localhost
npm run sync:frontend-contracts:local
```

Expected: `deployments/hardhat-chain1337-v2.json` gains `miniAppRegistry` +
`miniAppRegistryImpl`; `frontend/src/config/contracts.js` hardhat block populated.

## 3. Build + publish a first-party package (local dev gateway)

```bash
node scripts/miniapps/publish.js --app token-mint --dev   # build via tools/miniapp-build, hash, stage locally
# prints: appId, CID, manifestHash — use these to submitApp/approveApp (hardhat curator account)
```

Expected: `manifest.json` lists per-file sha256; printed `manifestHash` equals
`keccak256(manifest bytes)`; dev gateway serves the staged package to the frontend.

## 4. Host loop (frontend)

```bash
npm run frontend   # VITE_NETWORK_ID per local setup
```

Validate in the browser:
1. **Catalog** (`/wallet?tab=apps`): only Approved apps listed; search + six category
   filters narrow; cards show name/vendor/version/category. Pending/Suspended apps absent.
2. **Launch** (`/apps/token-mint`): loads, mounts, existing Token Mint workflow works;
   Network tab shows fetch from gateway then blob import — no remote `<script>`.
3. **Integrity refusal**: corrupt one byte of the staged `entry.js` (do not re-hash);
   relaunch → professional integrity error, nothing executes, `miniapp_integrity_failed`
   entry visible in Reporting.
4. **Suspension refusal**: `suspendApp` from the curator account → catalog entry gone,
   direct `/apps/token-mint` refused with explanation.
5. **Update honesty**: `submitUpdate` with a new CID → status Pending, but launch still
   serves the previously approved package; `approveApp` → new version serves.
6. **Deep links**: `/wallet?tab=tokens` and `?tab=clearpath` land on the corresponding
   mini-app (or catalog entry); `/wagers` still resolves.
7. **Review tab** (`/admin` → Compliance → Mini-App Review, curator account): Pending
   queue shows metadata + fetch/hash verification result; approve/suspend/deprecate
   controls absent for non-curator accounts.
8. **Audit**: Reporting shows `miniapp_launched` / `miniapp_tx_submitted` entries,
   filterable, timestamped, attributable.
9. **Degradation**: stop the dev gateway → launch shows availability error (with
   fallback tried); point registry reads at a dead RPC → catalog states verification
   unavailable and refuses launches.

## 5. Frontend test suite (scoped locally; full run in CI only)

```bash
cd frontend
npx vitest run src/test/miniapps/            # loader/integrity (tamper fixtures), store isolation, registry client
npx vitest run src/test/ledger/              # miniapp ledger source + class
npx vitest run src/test/nginxCspScriptSrc.test.js   # CSP gains blob: in script-src, nothing else
npx vitest run src/config/__tests__/appNav.test.js src/test/PortalNav.test.jsx
```

## 6. PWA cache (US6)

Production-ish build (`npm run build && npm run preview` in `frontend/`): launch an app,
then relaunch — package served from `fairwins-miniapp-packages-v1` cache (near-instant)
while status is still re-read; approve a new version → old cached CID unused for the
new version. Host update prompt behavior unchanged (existing `PwaUpdateNotification`).

## 7. Conversion parity (per app, as each phase lands)

- Token Mint: create a token via wizard, view detail/holders/activity panels.
- ClearPath: register/track an external DAO, open a proposal view; verify tracked DAOs
  survived migration into the namespaced store and appear in backup
  (`syncedObjects` `miniAppState`).
- Wagers (final phase): dashboard renders, create + accept flows work; `/wagers`
  redirects to the mini-app only after its conversion phase completes.
