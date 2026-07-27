# Contract: Membership reference-chain resolver

**Module**: `frontend/src/config/networks.js` (additions)
**Consumers**: `utils/blockchainService.js`, `components/ui/PremiumPurchaseModal.jsx`, any future
membership surface.

## Surface

```js
/** The single chain that is the authority for membership in this build's cohort. */
export function membershipChainId(): number

/** Every chain this build may read. Mainnets-first ordering. */
export function cohortChainIds(): number[]

/** Whether a chain is in this build's cohort. */
export function isInCohort(chainId: number): boolean
```

## Rules

1. **Exactly one reference chain per build** (FR-001). `membershipChainId()` is a pure function of
   build configuration and returns the same value for the life of the process.

2. **Derived, not declared** (research R1). The value comes from the existing
   `MAINNET_CHAIN_ID` / `TESTNET_CHAIN_ID` pair, selected by
   `NETWORKS[PRIMARY_CHAIN_ID].isTestnet`. A second literal `137` must not appear.

3. **Never crosses the cohort boundary** (FR-002, constitution III). A testnet build returns the
   testnet reference chain and never `137`. `isInCohort(membershipChainId())` is invariantly true;
   if it ever is not, the build is misconfigured and resolution must fail loudly rather than return
   a chain outside the cohort.

4. **Not runtime-configurable.** No setter, no member preference, no operator control, no URL
   parameter. It is a payment destination (FR-006): a wrong value sends funds to a chain where the
   membership will never be read.

5. **`cohortChainIds()` is the only roster any estate read may use.** Callers must not build their
   own list from `listSupportedChainIds()`, which spans both cohorts.

## Consumer obligation

`blockchainService.js` resolves the **membership** branch of `hasRoleOnChain` and
`getUserTierOnChain` against `membershipChainId()`, ignoring any chain the caller passed. The
**admin-role** branch continues to honour the caller's explicit chain — admin roles are genuinely
per-chain (research R3, R4).

This split is the reason the change is two functions rather than six call sites, and the reason a
future membership caller cannot get it wrong by habit.

## Test obligations

- `membershipChainId()` returns 137 under a mainnet build and 80002 under a testnet build.
- A testnet build never returns a mainnet chain id (SC-008).
- `hasRoleOnChain(account, 'WAGER_PARTICIPANT', <any chain>)` reads the reference chain's
  MembershipManager — asserted by observing the address the contract was constructed against, the
  technique `adminLeastPrivilege.test.jsx` already uses.
- `hasRoleOnChain(account, 'GUARDIAN', 8453)` still reads chain 8453 — the admin branch is
  unaffected.
- A source-level guard asserts no membership read passes a wallet-derived chain.
