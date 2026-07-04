# Interface Contract: On-Chain Account Stack & Deployment Keys

Provider: `contracts/account/` (vendored, pinned commit per research §1) +
`scripts/deploy/deploy-account-stack.js`. Consumers: frontend (via
`sync:frontend-contracts`), tests, 036 relayer/bundler config, future
ETC/Mordor increment.

## Vendored contracts (`contracts/account/`)

Pinned Coinbase Smart Wallet release; **no source modifications** (fork =
losing the audit). Files: account implementation, factory, `WebAuthnSol`
(+ FreshCryptoLib P-256 fallback verifier), ERC-1271 plumbing.

Behavioral surface relied upon (covered by `test/account/`):

| Capability | Used by |
|---|---|
| `factory.createAccount(owners, nonce)` / `getAddress(owners, nonce)` — CREATE2-deterministic | counterfactual addresses (FR-005/FR-007), cross-chain address equality (FR-023) |
| owners = P-256 pubkeys **or** EOA addresses; `addOwner*` / `removeOwner*` gated to self-call (i.e. via UserOp/owner) | controllers model (FR-018–FR-020) |
| remove-last-owner reverts | FR-020 |
| `isValidSignature` (ERC-1271) accepting WebAuthn-owner assertions | 035 intent signing (USDC v2.2 / ERC-7598), typed-data signing |
| `executeBatch(calls[])` | single-ceremony approve+act (FR-016) |
| `WebAuthnSol`: RIP-7212 precompile at `0x…0100` first, Solidity fallback second | Polygon/Amoy cheap path (SC-006); ETC/Mordor later increment (FR-022) |
| UUPS upgrade authorized **only by account owners** | Complexity Tracking entry 2 — FairWins holds no upgrade authority |

## Deployment keys (recorded in `deployments/`, per network)

| Key | Value | Notes |
|---|---|---|
| `entryPoint` | canonical EntryPoint address (version pinned to account release, research §2) | recorded even where pre-existing (constitution V); self-deployed deterministically on ETC/Mordor later |
| `accountFactory` | FairWins-deployed factory instance | MUST be byte-identical address on every network (deterministic-deployer replay, research §7); deploy script **asserts cross-network equality and fails loudly** |
| `p256Verifier` | fallback Solidity verifier (only where `WebAuthnSol` needs an external one) | present on networks without RIP-7212 |

`scripts/sync-frontend-contracts.js` carries all three to the frontend
config; the frontend never hardcodes them. Networks lacking `accountFactory`
⇒ connector reports `ChainNotSupportedError` (FR-022).

## Non-changes (asserted by integration tests)

- `MembershipManager`, `WagerRegistry`, `ZKWagerPoolFactory`, `SanctionsGuard`
  require **no modifications**: the smart account is `msg.sender` and the
  screened/gated address. `test/integration/passkey-account.e2e.test.js`
  proves membership purchase, wager create/accept/claim, and screening-block
  behave identically for a contract-account sender.
- No subgraph changes: events already index by address.

## CI obligations

`contracts/account/` enters the standard gates: Slither (document+justify any
findings inherited from the vendored code), Medusa where stateful, unit +
integration suites, security-agent review (constitution I). Storage-layout CI
(`check:storage-layout`) does **not** apply to user-owned accounts (they are
not FairWins-managed proxies) — documented in plan.md Complexity Tracking.
