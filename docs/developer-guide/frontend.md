# Frontend Development

Guide to developing the FairWins React frontend in `frontend/`.

## Technology stack

- **React 18** + **Vite** — SPA, no server-side rendering, no backend
- **wagmi** — wallet connection (MetaMask, WalletConnect) and chain switching
- **ethers.js v6** — contract reads/writes
- **Vitest** — unit tests (`npm run test:frontend` from the repo root)
- **Cypress** — E2E tests
- Plain **CSS** co-located with components

## Project structure

```
frontend/src/
├── App.jsx                  # routes (see below)
├── pages/                   # route-level pages (WalletPage, MarketAcceptancePage, legal/)
├── components/
│   ├── fairwins/            # Dashboard, FriendMarketsModal, MyMarketsModal,
│   │                        #   MarketAcceptanceModal, ShareWagerModal
│   ├── wallet/              # WalletButton (connect + network toggle)
│   ├── compliance/          # EntryGate (eligibility notice)
│   └── ui/                  # WagerQRCode, QRScanner, PremiumPurchaseModal, ...
├── hooks/                   # useFriendMarketCreation, useEncryption,
│                            #   useWalletManagement, useChainTokens, ...
├── contexts/                # FriendMarketsContext (wager cache), DexContext
├── data/wagers/             # EventsSource (RPC scan) + SubgraphSource (optional)
├── abis/                    # contract ABIs (WagerRegistry, MembershipManager, ...)
├── config/
│   ├── contracts.js         # per-chain addresses — GENERATED, do not hand-edit
│   ├── networks.js          # chain capabilities (DEX, Polymarket availability)
│   └── wagmi.js             # connectors + default chain
└── constants/wagerDefaults.js  # canonical enums & defaults (resolution types,
                                #   statuses, stake/deadline bounds)
```

## Routes (`src/App.jsx`)

| Route | Page | Notes |
|-------|------|-------|
| `/` | LandingPage | public marketing page |
| `/terms`, `/risk`, `/privacy` | LegalDocPage | versioned, hash-linked legal documents |
| `/app` (aliases `/main`, `/fairwins`) | Dashboard | main workspace, inside `AppLayout` (Header + EntryGate + Footer) |
| `/wallet` | WalletPage | Account Center: Account / Membership / Security / Preferences / Swap tabs |
| `/friend-market/accept` | MarketAcceptancePage | QR / deep-link wager acceptance (`?marketId=N`) |
| `/admin` | AdminPanel | the operations control plane, grouped by operator area; role-gated (Admin / Guardian / Account Moderator / Role Manager / Compliance Officer) — see `docs/runbooks/operations-control-plane.md` |
| `*` | redirect to `/` | |

## Getting started

```bash
npm run frontend           # dev server, from the repo root
# or
cd frontend && npm install && npm run dev
```

## Contract configuration

Addresses come from `src/config/contracts.js`, keyed by chain ID (137 Polygon
mainnet, 80002 Amoy, 1337 Hardhat, 63 Mordor/ETC). The file is **generated**
from `deployments/` records:

```bash
npm run sync:frontend-contracts -- --network polygon --chainId 137
```

Never hand-edit addresses; fix the deployment record and re-sync.

## Core patterns

### Writing: the wager-creation flow

`useFriendMarketCreation` shows the canonical write pattern — every mutation
is preceded by the same guards the contracts enforce:

1. membership check (`MembershipManager.getMembership`)
2. expired-wager cleanup if the user is at their concurrent limit
   (`batchExpireOpen`)
3. ERC-20 `approve` for the stake if allowance is insufficient
4. the actual `WagerRegistry.createWager(...)` call
5. optional encrypted-terms upload to IPFS (CID stored in `metadataUri`)

In-flight transactions are persisted to localStorage so a reload can resume
the flow.

### Writing: open challenges and voucher redemption

Two feature flows mirror the same approve-then-call pattern but resolve the
contract chain-aware (`getContractAddressForChain(name, chainId)`):

- **Open challenges (024)** — `hooks/useOpenChallengeCreate.js` and
  `hooks/useOpenChallengeAccept.js`, surfaced by
  `components/fairwins/OpenChallengeModal.jsx`. Create generates a four-word
  code client-side (`utils/claimCode/`), derives the on-chain `claimAuthority`,
  seals the terms under a code-keyed envelope, and calls `createOpenWager`.
  Take = `discover(code)` (read-only lookup + decrypt) then `accept(code,
  wagerId)`, which **approves the stake, signs an EIP-712 acceptance, then
  calls `acceptOpenWager`** — the approval step is mandatory (escrows the
  matching stake) and is reported through a step checklist.
- **Membership vouchers (026)** — `MembershipVoucher.mint` (USDC approval to
  the voucher contract) and `MembershipManager.redeemVoucher`; the voucher is a
  standard ERC-721, so transfer/gift uses normal wallet flows. ABIs:
  `abis/MembershipVoucher.js` + the voucher functions on `abis/MembershipManager.js`.

### Reading: the wager cache

`FriendMarketsContext` is the single source of truth for the user's wagers,
cached per chain. It pulls from `data/wagers/EventsSource.js` (direct RPC event
scans + `getUserWagers` pagination). `SubgraphSource.js` reads the **v2
`WagerRegistry`** subgraph (spec 017) for features like draw proposals, but the
wager grid stays direct-from-chain so a subgraph outage degrades gracefully.

### Encryption

`useEncryption` derives encryption keys from a wallet signature, looks up
counterparty public keys in `KeyRegistry`, and envelope-encrypts wager terms
before pinning to IPFS. Decryption is lazy — triggered when the user opens a
wager's details. See [Encryption Architecture](encryption-architecture.md).

### Network handling

`config/wagmi.js` defines the default chain (Polygon 137, overridable via
`VITE_NETWORK_ID`); `useNetworkMode` implements the mainnet ↔ Amoy toggle in
the wallet dropdown. Per-chain feature flags (DEX availability, Polymarket
side-bets) live in `config/networks.js` — gate UI on those capabilities rather
than on chain IDs.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_NETWORK_ID` | default chain (137 production, 80002 testnet) |
| `VITE_RPC_URL` | default RPC endpoint |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect cloud project |
| `VITE_IPFS_GATEWAY` | IPFS read gateway (Pinata) |
| `VITE_ORACLE_MODELS` | `polymarket-only` (default) or `all` — which oracle resolution types the UI exposes |

Secrets (e.g. the Pinata JWT) are **never** Vite build args — they're injected
at runtime on Cloud Run. See [Architecture](architecture.md#serving-infrastructure).

## Testing

```bash
npm run test:frontend      # Vitest, from the repo root
```

Gotchas worth knowing before mocking contract hooks: `vi.mock` factories are
hoisted (no outer-scope references), and `getContractAddress` mocks must cover
every chain the component touches. Match existing test patterns in
`frontend/src/**/__tests__/`.

## Building for production

```bash
cd frontend && npm run build   # output in dist/
```

Production images are built by `cloudbuild.yaml` (multi-stage Docker: Vite
build → nginx). Routing, caching, and security headers live in
`frontend/nginx.conf` — note the CSP origin allowlist and the
Permissions-Policy `camera=(self)` required by the QR scanner.

## Next steps

- [Architecture overview](architecture.md)
- [Smart contracts](smart-contracts.md)
- [Testing](testing.md)
- [Contributing guidelines](contributing.md)
