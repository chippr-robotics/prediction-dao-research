# Quickstart: Multisig Policy Engine (spec 049)

Runnable validation that the feature works end-to-end. See [data-model.md](./data-model.md) and
[contracts/](./contracts/) for details; this is a validation guide, not implementation doc.

## Prerequisites

```bash
npm ci                      # root deps (includes @safe-global/safe-contracts devDep)
npm run compile             # contracts build clean
```

## 1. Contract suites

```bash
npx hardhat test test/custody/SafePolicyGuard.test.js test/custody/PolicyGuardSetup.test.js
npx hardhat test test/integration/policy-guard-safe.test.js
npm test                    # full suite — spec 043 custody tests must stay green (SC-007)
```

Expected: every FR-002 rule combination enforced (SC-002); exemption paths prove a max-strict
policy still accepts self/guard-targeted transactions (SC-003); real-Safe integration creates a
vault with `PolicyGuardSetup`, blocks an over-limit `execTransaction` with the typed error, and
executes a threshold-approved `configureRules` change.

## 2. Static analysis

```bash
npm run slither 2>/dev/null || slither contracts/custody/SafePolicyGuard.sol contracts/custody/PolicyGuardSetup.sol
```

Expected: no new high/critical findings.

## 3. Local deployment + sync

```bash
npx hardhat node &
npx hardhat run scripts/deploy/custody/deploy-policy-guard.js --network localhost
npm run sync:frontend-contracts:local
```

Expected: `deployments/` gains `safePolicyGuard` + `policyGuardSetup`; frontend config resolves
both via `getContractAddressForChain(..., 1337)`.

## 4. Frontend suites

```bash
npm run test:frontend
```

Expected: `policy.test.js` + PolicyStep/PolicyPanel/PolicyBadge/ProposeTransactionForm suites pass
including axe checks; existing custody suites untouched.

## 5. Manual walkthrough (dev server)

```bash
npm run frontend
```

1. Protect → Create vault → Policy step: set per-tx limit + allowlist → deploy → detail view shows
   the exact rules (US1).
2. Vault list shows the policy badge; a policy-less vault shows none (US2).
3. Propose a transfer exceeding the limit → pre-flight names the rule and amount (US4); submit
   anyway + approve to threshold → execution blocked with the same message (US1-AS4).
4. Propose a rule change; second owner sees current-vs-proposed; approve to threshold → panel
   reflects the new rules (US3).
5. Switch to an unsupported network → Policy step and panel show "unsupported", custody still
   works (FR-013).
