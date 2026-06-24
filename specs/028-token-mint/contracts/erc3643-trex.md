# Contract: Permissioned Security Token (T-REX / ERC-3643)

Delivered by the **vendored, audited** ERC-3643 reference suite (`@tokenysolutions/t-rex`) plus ONCHAINID
(`@onchain-id/solidity`) — used unforked. `TokenFactory` deploys/wires a per-token suite and records it; the
platform `SanctionsGuard` is enforced via a compliance module. Maps to FR-005, FR-011–017, FR-021, User Story 4.

## Per-token suite (managed by T-REX)

| Component | Role |
|-----------|------|
| ERC-3643 Token | Permissioned token; transfers gated by identity + compliance. |
| Identity Registry (+ Storage) | Maps holder address → ONCHAINID identity + country; the eligibility source. |
| Modular Compliance | Holds bound rule modules; consulted on every transfer. |
| Claim Topics Registry | Required claim topics for holders. |
| Trusted Issuers Registry | Issuers whose claims are accepted. |

## Authority

- **owner** — token issuer; top-level authority; manages agents, registries, claim topics, trusted issuers (FR-017).
- **agent(s)** — operational authority delegated by the owner.

## Agent/owner administration (per ERC-3643)

```
freeze / unfreeze account          // full account freeze
freezePartialTokens / unfreezePartialTokens   // partial balance freeze (FR-013)
forcedTransfer(from, to, amount)   // FR-014
recoveryAddress(lostWallet, newWallet, investorOnchainID)   // FR-015 — newWallet must carry the same identity
mint / burn                        // FR-016
pause / unpause                    // FR-016
```

Registry/issuer/topic management (`addAgent`, `registerIdentity`, `addClaimTopic`, `addTrustedIssuer`, …) is
restricted to the appropriate owner/agent roles (FR-017). Any non-agent/owner caller is rejected on-chain
(FR-019).

## Transfer validation (FR-011 / FR-012)

A transfer succeeds only when **both** sender and recipient:
1. are registered in the Identity Registry with **valid required claims** from **trusted issuers**, AND
2. satisfy **all** bound compliance modules.

Otherwise it reverts. Missing/invalid claim ⇒ blocked; violated compliance rule ⇒ blocked.

## SanctionsGuard integration (FR-021)

`SanctionsComplianceModule` implements the T-REX Modular Compliance module interface and delegates its checks to
`SanctionsGuard.isAllowed` (fail-closed). It is bound to each permissioned token's Modular Compliance at
creation, so platform sanctions screening is enforced **alongside** identity/claim checks without forking T-REX.

```
// SanctionsComplianceModule (platform-authored, implements IModule)
canTransfer(from, to, value, compliance) -> bool   // false if guard denies from or to
transferred(...) / created(...) / destroyed(...)    // no-op hooks (stateless screening)
moduleCheck(...) -> bool                             // = guard.isAllowed(from) && guard.isAllowed(to)
```

## TokenFactory wiring

`createPermissionedERC3643(TrexParams)`:
1. Screens the issuer via `SanctionsGuard` (fail-closed).
2. Deploys/initializes the suite via the T-REX gateway/factory with the issuer as owner and the requested claim
   topics / trusted issuers / compliance modules.
3. Binds `sanctionsComplianceModule` to the token's Modular Compliance.
4. Appends a `TokenRecord` (standard `PERMISSIONED_ERC3643`, with the suite addresses) and emits `TokenCreated`.

## Test contracts (acceptance — fork + integration)

- Transfer to a holder without required claims is rejected; transfer between two fully-verified, compliant
  holders succeeds.
- Agent freeze (full and partial) blocks movement of the frozen amount until unfrozen.
- Recovery moves balance + frozen status to a replacement wallet carrying the same identity; recovery to a
  wallet without that identity is rejected.
- Forced transfer and mint/burn by the agent update balances; pause blocks transfers.
- A sanctioned sender/recipient is blocked via the compliance module even with valid claims (FR-021).
- Non-agent/owner callers are rejected for every agent-only action (FR-019).

## Notes

- The suite contracts are **deployed**, not copied into `contracts/`. Only `SanctionsComplianceModule` (and the
  factory wiring) is platform-authored.
- Per-token upgradeability follows the T-REX proxy/ownership model; the platform does not manage it (research R6).
