# Token Mint (spec 028)

Token Mint lets an authorized issuer create and administer their own tokens directly on-chain through a single,
role-gated factory and a per-token admin surface. It revives and modernizes the archived `TokenMintFactory` /
`FairWinsToken` designs against the platform's current standards (UUPS authority, `SanctionsGuard`, role-gated
issuance, synced artifacts) — reference-only archive in `contracts-archive/tokens/`, never imported or deployed.

Spec: [`specs/028-token-mint/`](https://github.com/chippr-robotics/prediction-dao-research/tree/main/specs/028-token-mint).

## Standards supported

| Standard | Class | Notes |
|----------|-------|-------|
| **Open ERC-20** | `OpenERC20` clone | Optional `burnable` / `pausable` (init flags; a disabled capability reverts) |
| **Open ERC-721** | `OpenERC721` clone | Per-token URIs (`mint(to, uri)`); optional `burnable` |
| **Restricted ERC-1404** | `RestrictedERC20` clone | `detectTransferRestriction` / `messageForTransferRestriction`; per-token eligibility + freeze |
| **Permissioned ERC-3643 (T-REX)** | — | **Deferred** — see [Deferred: ERC-3643](#deferred-erc-3643t-rex) |

## Architecture

- **`TokenFactory`** (`contracts/tokens/TokenFactory.sol`) — the single upgradeable, state-bearing platform
  contract. Inherits [`UUPSManaged`](upgradeable-contracts.md) (UUPS + AccessControl + non-brickable upgrade gate
  + impl-init lockout) and `ReentrancyGuard`. Gates `create*` behind `TOKEN_ISSUER_ROLE`, screens the issuer
  through `SanctionsGuard` (fail-closed), deploys tokens as EIP-1167 minimal-proxy **clones** of immutable
  implementation templates, and records each token in a network-scoped registry (the source of truth for
  discovery and an issuer's admin list). Storage is append-only with a trailing `__gap`; registered in
  `npm run check:storage-layout`.
- **Issued tokens are immutable** per-issuer clones — only the factory is upgradeable. Each template stores a
  `SanctionsGuard` reference and screens sender + recipient in its transfer hook (`_update`), skipping the zero
  endpoint for mint/burn, so sanctions are non-bypassable for every class.

```
issuer ──create*──▶ TokenFactory (UUPS, TOKEN_ISSUER_ROLE, sanctions-screened)
                        │ clone + initialize (atomic, one tx)
                        ▼
                   OpenERC20 / OpenERC721 / RestrictedERC20  (immutable clone, owner = issuer)
                        │ every transfer
                        ▼
                   SanctionsGuard.isAllowed(from/to)  (fail-closed)
```

## Issuance flow

1. The platform admin (floppy-keystore `DEFAULT_ADMIN_ROLE`) grants `TOKEN_ISSUER_ROLE` to an issuer (the deploy
   script grants it to the deployer; grant to members out-of-band, mirroring `grantMembership`).
2. The issuer calls `createOpenERC20 / createOpenERC721 / createRestrictedERC20`. The factory validates metadata,
   screens the issuer, clones + initializes the template (issuer = owner, guard injected), then appends the
   registry row (CEI — no registry write on revert) and emits `TokenCreated`.
3. Discovery: `getTokensByIssuer(issuer)` → `getToken(id)`, or the subgraph `Token` entity on subgraph-enabled
   networks.

## Administration surface

The per-token admin panel renders **only** the controls valid for the token's standard (FR-018), each a real
on-chain transaction restricted to the owner on-chain (FR-019):

- **All standards**: owner `mint`; ownership transfer (`transferOwnership`).
- **Open ERC-20**: `pause` / `unpause` (pausable only); holder `burn` (burnable only).
- **Open ERC-721**: `mint(to, uri)`; holder `burn` (burnable only).
- **Restricted ERC-1404**: `setEligible[Batch]`, `setFrozen`, plus an eligibility **pre-check**
  (`detectTransferRestriction`) whose result matches the actual transfer outcome (SC-003). Evaluation order,
  most-restrictive first: sanctioned → frozen → not-eligible.

## SanctionsGuard integration

Reuses the platform's existing [`SanctionsGuard`](treasury-security.md) rather than a parallel system: the issuer
is screened at creation, and every issued token screens sender + recipient on transfer (fail-closed; `address(0)`
disables as a deliberate per-network config). No sanctioned address can create, send, or receive any class.

## Deploy & sync

`scripts/deploy/deploy.js` deploys the three immutable clone templates deterministically, deploys `TokenFactory`
behind a UUPS proxy via `scripts/deploy/lib/upgradeable.js`, wires `SanctionsGuard`, grants `TOKEN_ISSUER_ROLE`
to the deployer, and records `tokenFactory` + `tokenFactoryImpl` + the template addresses in `deployments/`.
`scripts/deploy/verify.js` verifies the factory implementation and the templates. Then:

```bash
npm run check:storage-layout       # TokenFactory append-only storage gate
npm run sync:frontend-contracts    # frontend picks up addresses (never hand-copied)
```

The frontend feature self-disables on networks without a deployed `tokenFactory` (FR-023). On subgraph-less
networks (Mordor/ETC) discovery reads the factory registry over RPC — see
[networks-without-subgraph.md](networks-without-subgraph.md).

## Frontend

`frontend/src/components/tokens/` — `useTokenFactory` (network gating + issuer-role check + reads + create writes
with honest pending/confirmed/failed state), `CreateTokenWizard`, `TokenList`, `TokenAdminPanel`. ABIs are
hand-maintained in `frontend/src/abis/tokenFactory.js` (app) and `frontend/src/abis/TokenFactory.json` (subgraph).

## Subgraph

A `TokenFactory` datasource indexes `TokenCreated` into a `Token` entity for discovery. **Pending deployment**:
the manifest's inline address is a placeholder until `TokenFactory` ships to a subgraph-enabled network (Amoy/
Polygon); add the real address + deploy block to `subgraph/networks.json` then. Mordor/ETC has no subgraph and
uses the on-chain RPC fallback.

## Upgradeability

Only `TokenFactory` is platform-upgradeable (UUPS, append-only storage, CI-gated by `check:storage-layout`).
Issued open/restricted tokens are **immutable** clones. Ship logic changes as in-place factory upgrades
(`lib/upgradeable.js upgradeProxy`), never a fresh redeploy. See [upgradeable-contracts.md](upgradeable-contracts.md)
and [runbooks/contract-upgrades.md](../runbooks/contract-upgrades.md).

## Deferred: ERC-3643 / T-REX

The permissioned security-token class (User Story 4) is **deferred**. The canonical reference suite
(`@tokenysolutions/t-rex` + `@onchain-id/solidity`) only supports OpenZeppelin **4.x** and pins
`pragma solidity 0.8.17`, which is incompatible with this repo's OpenZeppelin pin (OZ 5.4.0 — the newest
ETC/Mordor-compatible version; OZ ≥5.5 requires the Cancun `mcopy` opcode that pre-Cancun ETC cannot run). The
`TokenStandard.PERMISSIONED_ERC3643` enum value and the `TokenRecord.suite` field are reserved so the registry
stays forward-stable; revisit when an OZ-5-native ERC-3643 ships or a decision is made to isolate the OZ-4 suite
in a separate build profile.

## Security

- Constitution Principle I: CEI on issuance (registry written only after a successful clone+init), reentrancy
  guards, `_disableInitializers` on every template + the factory impl, one-time `initialize`, non-brickable
  upgrade gate, append-only storage, fail-closed non-bypassable sanctions, EthTrust-SL ≥ L2.
- Tests: unit + integration + upgrade-lifecycle (`test/tokens/`, `test/integration/tokens/`,
  `test/upgradeable/TokenFactory.upgrade.test.js`); frontend Vitest; subgraph Matchstick.
- Slither (clone/proxy/UUPS detectors) + Medusa run in CI with no new high/critical findings.
