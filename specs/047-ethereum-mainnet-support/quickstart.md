# Quickstart: Ethereum Mainnet & Testnet Support

End-to-end validation for spec 047. Proves a member can select the Ethereum networks, see
Ethereum holdings in the portfolio, and send/receive on an active Ethereum network — with
unavailable capabilities disclosed honestly. All work is in `frontend/`.

## Prerequisites

- Node + repo deps installed (`npm ci` at repo root; `frontend/` deps as usual).
- A browser wallet (e.g. MetaMask) with Ethereum mainnet and, optionally, Sepolia/Hoodi
  test funds — for the manual send/receive check only.
- No contract deploy, subgraph, or backend is required (Ethereum has no app contracts).

## Automated validation (authoritative)

Run the frontend suite — these assertions encode the contracts in `contracts/`:

```bash
npm run test:frontend
```

Expect green for at least:

- `frontend/src/test/networks.test.js` — Ethereum family in the selectable set, ordering,
  portfolio chain scope.
- `frontend/src/test/networks.mainnet.test.js` — mainnet value-network framing; swap/wager
  still off; curated tokens present.
- `frontend/src/test/networks.ethereum.test.js` (new) — Hoodi entry (560048), Sepolia
  selectable, wagmi/networks parity, honest capability flags.
- `frontend/src/test/blockExplorer.test.js` (new/updated) — per-chain explorer scoping; no
  Amoy fallback leak.
- `frontend/src/test/portfolio/usePortfolio.test.jsx` — Ethereum curated holdings, testnet
  gating behind the opt-in, Chainlink pricing + `failedAssets` honesty.

Lint + a11y gates (must stay green, constitution IV/V):

```bash
cd frontend && npm run lint && npm run test  # test includes axe checks on touched surfaces
```

## Manual validation (behavioral, US1–US3)

Start the app:

```bash
npm run frontend
```

1. **US1 — Select an Ethereum network** (SC-001)
   - Open **My Account → Network**.
   - Confirm **Ethereum** (Mainnet), **Hoodi** (Testnet), **Sepolia** (Testnet) each appear
     as cards, testnets labelled, with capability tags showing wager/swap/passkey as
     "not deployed" and (mainnet) ClearPath available.
   - Click **Switch** on **Ethereum** → the wallet prompts, and on confirm the card shows
     **Connected** and every active-network indicator reads Ethereum. Repeat for Hoodi and
     Sepolia. (Before this feature, switching to Ethereum threw "chain not configured".)

2. **US2 — See Ethereum assets in the portfolio** (SC-002, SC-005)
   - With an account holding ETH/USDC on mainnet, open the **Portfolio** view.
   - Confirm the Ethereum holdings appear alongside other networks, labelled Ethereum, with
     ETH priced (Chainlink) and stablecoins at $1 contributing to the total.
   - With **show testnet assets** OFF, confirm no Hoodi/Sepolia holdings appear; toggle it
     ON and confirm testnet holdings then appear. (0 testnet leak when off.)
   - Temporarily point `VITE_RPC_URL_MAINNET` at an unreachable URL → confirm the affected
     assets are reported as unread, not shown as $0, and the rest of the portfolio renders.

3. **US3 — Send & receive on Ethereum** (SC-004)
   - With Ethereum active and a funded account, open **Wallet → Pay & Transfer**.
   - Send a small amount of **ETH** to a second address; confirm the fee treatment is
     disclosed before confirm (native ETH fee, self-submit) and the balance reflects the
     send on success.
   - Confirm sending to a sanctions-flagged address is blocked.
   - Open the **receive** (address QR) surface; confirm your Ethereum address renders as a
     scannable QR.

4. **Honest unavailability** (SC-003)
   - While on Ethereum, visit the swap and wager surfaces; confirm each discloses
     "not available on this network" rather than presenting a broken action.

## Rollback / safety

- Pure frontend config + wiring; revert the touched files to undo. No migrations, no
  deployments, no persisted state to clean up.
- `PRIMARY_CHAIN_ID`/wagmi default (Polygon) are unchanged — existing flows are unaffected
  (SC-006).

## References

- Config shapes & addresses: [data-model.md](./data-model.md)
- Behavior contracts & test map: [contracts/network-config.md](./contracts/network-config.md),
  [contracts/portfolio-and-capabilities.md](./contracts/portfolio-and-capabilities.md)
- Decisions & rationale: [research.md](./research.md)
