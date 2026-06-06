# Phase 0 Research: Local Dev Environment

All findings are grounded in the current repository state (verified at plan time).
Each decision resolves a Technical Context item; no `NEEDS CLARIFICATION` remain.

## R1 — Which two wallets to fund

**Decision**: Use the deterministic Hardhat default accounts #0 and #1:
- `#0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (also the deployer)
- `#1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8`

**Rationale**: `hardhat.config.js:221-228` configures the `hardhat`/`localhost` network with `chainId: 1337`, 20 accounts × 100,000 ETH each, from the standard Hardhat mnemonic — so both accounts already hold native gas, and their private keys are publicly known and safe to import into MetaMask for local use. Account #0 is the deployer and holds `ROLE_MANAGER_ROLE`, so it can grant membership to itself and #1 without extra wiring. No secret is created or committed (Constitution: Key management).

**Alternatives considered**: Custom wallets from `.env` private keys — rejected: adds ceremony, risks committing/printing keys, and provides no benefit over the well-known deterministic accounts for a throwaway local chain.

## R2 — How to fund the test ERC20 stake token

**Decision**: Mint the deployed `MockERC20` USDC (and WMATIC) to each wallet via the permissionless `mint(address,uint256)`.

**Rationale**: `contracts/mocks/MockERC20.sol:19-21` exposes `function mint(address to, uint256 amount) external` with **no access control** — any caller can mint. `deploy.js` deploys USDC with `initialSupply = 0` (`scripts/deploy/deploy.js:169`), so wallets start with a zero token balance; the seed step must mint. USDC is 6-decimal (`deploy.js:53`), WMATIC 18-decimal (`deploy.js:180`). Mint a generous amount (e.g. 1,000,000 USDC, 1,000 WMATIC) so many wagers can run.

**Alternatives considered**: A faucet contract or transferring from a pre-funded holder — rejected: `mint` already does this with no new code.

## R3 — How to satisfy the membership gate (`checkCanCreate`)

**Decision**: From the deployer, call
`membershipManager.grantMembership(wallet, WAGER_PARTICIPANT_ROLE, Tier.Bronze, 365)`
for each of the two wallets.

**Rationale**: `WagerRegistry` gates creation with
`if (!membershipManager.checkCanCreate(msg.sender, WAGER_PARTICIPANT_ROLE)) revert MembershipDenied();`
(`contracts/wagers/WagerRegistry.sol:237`). `checkCanCreate`
(`MembershipManager.sol:190-198`) returns true only when the wallet has a non-`None`
tier that has not expired (and is within monthly/concurrent limits). `grantMembership`
(`MembershipManager.sol:102-111`) requires `ROLE_MANAGER_ROLE`, which the deployer
receives in the constructor (`MembershipManager.sol:66`). `Tier` is
`{ None, Bronze, Silver, Gold, Platinum }` (`contracts/interfaces/IMembershipManager.sol:7`)
and `deploy.js` already seeds tier configs for `WAGER_PARTICIPANT_ROLE`
(`deploy.js:216`), so Bronze is a valid, configured tier. The role hash is
`keccak256("WAGER_PARTICIPANT_ROLE")` (`scripts/deploy/lib/constants.js:159`).

**Alternatives considered**: Granting Gold/Platinum — unnecessary; Bronze is the
lowest active tier and passes the gate. Longer/shorter durations — 365 days avoids
expiry during a dev session.

## R4 — How to remove staking-approval friction

**Decision**: In the seed step, from each wallet, `approve(wagerRegistry, largeAmount)`
on the USDC (and WMATIC) token.

**Rationale**: Creating/accepting a wager pulls the stake via `transferFrom`, which
requires an allowance. Pre-approving (FR-006 "pre-approved" branch) lets the manual UI
flow proceed without a separate approve transaction interrupting the demo. The frontend
may still show/issue its own approval; a generous pre-approval is harmless.

**Alternatives considered**: Leave approval to the UI (FR-006 "documented step"
branch) — viable, but pre-approving is smoother for the headline end-to-end demo; the
runbook still documents that the UI handles approval if allowance is insufficient.

## R5 — Replace or fix the seeding script

**Decision**: Add a new `scripts/operations/seed-local.js` and repoint the `seed:local`
npm script to it. Do not attempt to adapt `seed-testnet.js`.

**Rationale**: `seed:local` currently runs `seed-testnet.js`
(`package.json`), which is built for the **v1** architecture: it targets a
`ConditionalMarketFactory` that does not exist in v2 (`seed-testnet.js:146,164`), calls
removed methods (`deployMarketPair`, `buyTokens` — lines 224, 308), depends on
`SEED_PLAYER_*` env vars, and never mints tokens or grants membership. Adapting it would
be more work and risk than a focused new script that reads the v2 deployment record and
performs exactly: mint → grant membership → approve, for the two wallets.

**Alternatives considered**: Extend `deploy.js` to seed wallets — rejected: keeps deploy
network-agnostic and avoids minting/granting on non-local networks; seeding is a
distinct, local-only concern.

## R6 — Wiring the frontend to the local deployment

**Decision**: Use the existing `scripts/utils/sync-frontend-contracts.js` invoked for
localhost/1337 to write the `HARDHAT_CONTRACTS` block; add a
`sync:frontend-contracts:local` npm convenience target. The runbook sets
`VITE_NETWORK_ID=1337`.

**Rationale**: The sync tool maps chainId `1337 → HARDHAT_CONTRACTS`
(`sync-frontend-contracts.js`), reads `deployment.contracts.*` for the registry
addresses and top-level `deployment.paymentToken` / `deployment.wmatic` for the tokens
(lines 149-165), exactly the shape `deploy.js` writes to
`deployments/localhost-chain1337-v2.json`. The current `HARDHAT_CONTRACTS` addresses are
**stale** (from a 2026-05-22 run), so a fresh deploy + sync is required. Constitution V
mandates addresses come from this generated artifact, never hand-copied — the runbook
must enforce sync, not manual edits.

**Alternatives considered**: Hand-editing `HARDHAT_CONTRACTS` — forbidden by
Constitution V.

## R7 — One-command orchestration vs documented sequence

**Decision**: Provide both: a `npm run setup:local` aggregate (deploy:local → sync(1337)
→ seed:local) that runs against an already-running node, plus a documented runbook
covering `npm run node` (separate terminal), `setup:local`, `VITE_NETWORK_ID=1337
npm run frontend`, and wallet import.

**Rationale**: The node is a long-running foreground process, so it stays a separate
command; everything that runs *against* the node is collapsed into one orchestrator.
This satisfies the spec's "one-command-or-documented" intent and SC-001 (<5 min) while
keeping the steps transparent.

**Alternatives considered**: A single script that also spawns/backgrounds the node —
rejected: backgrounding the node hides its logs and complicates teardown; keeping it
explicit is clearer for developers.

## R8 — End-to-end resolution path for the default flow

**Decision**: The default documented end-to-end uses a **non-oracle** wager
(creator/opponent/either resolution) that can be resolved locally; private/encrypted
wagers and live external oracles are out of scope for the default flow.

**Rationale**: Matches the spec assumptions. A locally-resolvable wager proves the full
create → accept → resolve → claim path without standing up oracle infrastructure.
`MockPolymarketCTF` exists (`deploy.js`) if an oracle-style demo is wanted later, but it
is not required to satisfy the spec.

**Alternatives considered**: Wiring `MockPolymarketCTF` resolution into the default
runbook — deferred; adds steps without changing whether the lifecycle works.

## R9 — Idempotency & reset

**Decision**: `seed-local.js` is idempotent — minting adds balance, `grantMembership`
overwrites the membership record, and `approve` resets allowance, so re-running after a
node restart fully restores the funded state. Reset = restart `npm run node` then re-run
`npm run setup:local`.

**Rationale**: The Hardhat node is ephemeral (state wiped on restart). `grantMembership`
overwrites `_memberships[user][role]` (`MembershipManager.sol:102-111`), so repeated
grants are safe. This satisfies FR-010/FR-011 and SC-006.
