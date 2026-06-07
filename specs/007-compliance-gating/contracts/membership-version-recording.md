# Contract: On-chain consent-of-record (version recording)

How the accepted/bound T&C version hash is recorded on-chain so the chain is the
fail-closed, immutable, queryable consent store (FR-045–FR-050, no backend).

## MembershipManager (modified)

```solidity
struct Membership { /* existing fields */ bytes32 acceptedTermsHash; uint64 acceptedAt; }

function purchaseTier(bytes32 role, Tier tier, bytes32 acceptedTermsHash) external; // + screened
function upgradeTier(bytes32 role, Tier newTier, bytes32 acceptedTermsHash) external; // + screened

event MembershipPurchased(address indexed user, bytes32 role, Tier tier, bytes32 acceptedTermsHash, uint64 at);
event MembershipUpgraded (address indexed user, bytes32 role, Tier newTier, bytes32 acceptedTermsHash, uint64 at);
```

**Rules**:
- First Check: `sanctionsGuard.checkBlocked(msg.sender)` (CEI preserved; before payment/effects).
- `acceptedTermsHash` is the SHA-256 of the in-force Terms version the user accepted in the
  client (FR-021/FR-039/FR-058). The contract records it + `block.timestamp` and emits it.
- The contract does NOT validate the hash content (off-chain canonicalization); it stores
  the binding so an auditor can resolve the exact version (FR-027) via the Legal Document
  Version manifest.
- Fail-closed/idempotent by construction: a revert grants no membership and no record;
  re-purchase converges on contract state.

## WagerRegistry (modified)

```solidity
struct Wager { /* existing */ bytes32 termsVersionHash; }

function createWager(/* existing args */, bytes32 termsVersionHash) external; // + screened(msg.sender)
event WagerCreated(uint256 indexed wagerId, address indexed creator, /* existing */ bytes32 termsVersionHash);
```

**Rules**:
- `createWager` Check: `sanctionsGuard.checkBlocked(msg.sender)`; stores `termsVersionHash`
  (the governing version, FR-056/FR-057) and emits it. `acceptWager` additionally
  `checkBlocked(w.creator)`.
- The same `termsVersionHash` is bound into the wager's encrypted metadata AAD off-chain
  (see `encrypted-metadata-v1.1.md`) so the binding is tamper-evident in both places.
- Prospective-only: existing wagers keep their stored hash; never re-bound (FR-057).

## KeyRegistry (light)

```solidity
event EligibilityAcknowledged(address indexed account, bytes32 termsRef); // generic ref, dated by block
```
Dates the deterministic eligibility signature via the registration block timestamp without
putting a date in the signed payload (FR-042/FR-043).

## Queryability (FR-047)

Address-keyed history comes from the indexed events above (chain logs + optional subgraph
extension). No backend index. The subgraph MAY add handlers for these events to expose
"all consents + governing versions for address X".
