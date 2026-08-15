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
| `/` | LandingRoute | public marketing page — forwards returning visitors to `/app` (see below) |
| `/terms`, `/risk`, `/privacy` | LegalDocPage | versioned, hash-linked legal documents |
| `/app` (aliases `/main`, `/fairwins`) | Dashboard | main workspace, inside `AppLayout` (Header + EntryGate + Footer) |
| `/wallet` | WalletPage | Account Center: Account / Membership / Security / Preferences / Swap tabs |
| `/friend-market/accept` | MarketAcceptancePage | QR / deep-link wager acceptance (`?marketId=N`) |
| `/admin` | AdminPanel | the operations control plane, grouped by operator area; role-gated (Admin / Guardian / Account Moderator / Role Manager / Compliance Officer) — see `docs/runbooks/operations-control-plane.md` |
| `*` | redirect to `/` | |

### Getting to a connected account

Nothing in the app works without a connected account, so the path to one is
kept as short as it can honestly be:

1. **`/` forwards returning visitors** (`components/LandingRoute.jsx`). Any
   browser that has attached an account before — a recorded passkey, or a wagmi
   `recentConnectorId` — and has acknowledged the entry gate goes straight to
   `/app`. First-time visitors still get the marketing page. Escape hatches,
   both remembered for the tab session: **Leave** on the entry gate, and
   `/?stay=1`.
2. **Entering the app prompts to unlock** (`components/wallet/AutoConnectPrompt.jsx`,
   mounted in `AppLayout`). It opens the shared ConnectModal once, after the
   eligibility gate is acknowledged and after wagmi's eager reconnect has
   **settled** (`connectionStatus` on the wallet context) — a restored session
   is never interrupted, and a deliberate sign-out is never undone by a
   re-prompt. Dismissing it leaves the member disconnected with the header and
   in-panel Connect buttons intact.
3. **The dialog opens where the member can act** (`components/wallet/ConnectModal.jsx`).
   When this browser already knows a usable passkey it opens on the account
   chooser — unlock in one tap instead of methods → Passkey → chooser. The
   choice itself is unchanged (issue #849: the app never guesses which account),
   and *More sign-in options* reaches every connector. A browser with no
   recorded passkey still opens on the methods list.

Spec 045 FR-001 still holds throughout: these surfaces *open* the one shared
ConnectModal, they never render connector choices of their own.

## Getting started

```bash
npm run frontend           # dev server, from the repo root
# or
npm install          # root install covers every workspace (spec 075)
npm run frontend     # == npm run dev --workspace frontend
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

### Settings surfaces: collapsed sections + sheets

The **Recovery** tab (`?tab=security`) hosts several independent, high-stakes
features (data backup, controllers, wallet-based recovery, legacy keys, the
encryption key, recovery codes). Each panel renders itself as an
`AccordionSection` inside the tab's `AccordionGroup`
(`components/account/AccordionSection.jsx`, `AccordionGroup.jsx`):

- **Collapsed by default**, with a one-line `summary` of the panel's current
  state and an optional `badge` when it needs attention — the tab opens as a
  scannable list, not a wall of controls.
- **One section open at a time** (`exclusive`, the group default). Group state
  is in memory, so returning to the tab always starts tidy.
- Children stay **mounted** while collapsed (that is what the
  `grid-template-rows: 0fr → 1fr` animation needs) but the region is `inert`, so
  nothing inside is focusable or announced until it opens.
- Panels keep their own `return null` gating: wrap the accordion **inside** the
  panel, and render `ActionSheet`s as **siblings** of the section, never inside
  the collapsible region (an inert ancestor would disable the sheet).
- Consequential or destructive actions — restore, remove a backup, link a
  wallet, remove a controller, delete a recovered key — confirm in an
  `ActionSheet` (centered card on desktop, bottom sheet on mobile) that states
  the consequence first.

### Section copy: a heading, not an essay

A member-facing section starts with its **controls**, not with a paragraph describing them. The rule
(set for Protect ▸ Verify by spec 085 FR-010, and now applied across the app) is:

> An intro paragraph survives only if it states something the screen underneath cannot show, and
> that a member needs **before** acting. Otherwise it is deleted, not shortened.

What that rules out, with the failure each one caused:

| Pattern | Why it goes |
|---|---|
| "Digital collectibles owned by your wallet. Open one to list it…" | Describes the grid below it and the actions on the item you open. |
| "…a small builder fee applies, shown before you sign." | A promise of a disclosure is not the disclosure. State the **number**, where it is known, at the confirm step (`TradeConfirm`). |
| "Best-execution swaps routed across…" | A claim with a regulatory meaning nobody is measuring, over a badge that already names the venue. |
| "You see the exact amount that will arrive and every cost before you sign." | The quote states those as figures a few rows down. |

What survives, and why: **Wagers** keeps one line, because escrow is the thing that makes it
different from every other tab in Transfer; **Bitcoin Stamps** keeps one, because a member who does
not know Stamp coins are unspendable will read their own balance as wrong; **Bridge** keeps its
"What is bridging?" `InfoTip` — moved onto the first field, since a tip does not need a paragraph to
hang off. `InfoTip` beside a heading or a label is the default home for anything explanatory: it is
one tap for the member who wants it and zero lines for the member who does not.

Honest-absence notes (an asset withheld because no route exists, a network that could not be read)
are **not** intro copy and are not covered by this — they are stated wherever the absence shows up,
as briefly as the fact allows.

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

- [Dialog and bottom-sheet focus management](dialog-focus-management.md) — read before adding a
  `role="dialog"` surface: an open, measured, repo-wide finding about focus containment, and the
  two half-implementations currently in the tree.
- [Architecture overview](architecture.md)
- [Smart contracts](smart-contracts.md)
- [Testing](testing.md)
- [Contributing guidelines](contributing.md)
