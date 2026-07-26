# Runbook: Protect policy engine operations (spec 068)

Operational procedures for the ordered policy engine (`SafePolicyGuardV2`) and multi-chain custody.
Design background: [protect-policies.md](../developer-guide/protect-policies.md).

## What operators can and cannot do

**Cannot**: change any vault's rules, approve or execute a vault transaction, pause the engine, or
recover funds. The guard has no admin, no owner, no roles, and holds no funds. Every policy change
is a threshold-approved transaction by the vault's own owners.

**Can**: deploy the engine to a chain, record addresses, and (not) remove it — an existing vault
keeps pointing at whatever guard address its owners set, forever, unless they change it.

This is the intended trust model. Do not add an admin path.

## Deploying to a new custody chain

Prerequisites: the chain is in `SAFE_CONTRACTS` (`frontend/src/config/safeContracts.js`), Safe
v1.4.1 is live there, and the deployer key is available through the floppy keystore flow.

```bash
# 1. Deploy the engine (CREATE2, deterministic; re-running is a no-op if already on-chain)
npx hardhat run scripts/deploy/custody/deploy-policy-guard-v2.js --network <net>

# 2. Deploy the proposal hub if this chain does not have one
npx hardhat run scripts/deploy/custody/deploy-safe-proposal-hub.js --network <net>

# 3. Sync addresses into the frontend
npm run sync:frontend-contracts -- --network <net> --chainId <id>

# 4. Verify on the explorer
npx hardhat verify --network <net> <safePolicyGuardV2 address>
npx hardhat verify --network <net> <policyGuardSetup address>
```

### Post-deploy checklist

- [ ] `deployments/<net>-chain<id>-v2.json` records `safePolicyGuardV2`, `policyGuardSetup`,
      `safeProposalHub` with their deploy blocks.
- [ ] `frontend/src/config/contracts.js` carries all three for that chain.
- [ ] **`DEPLOYMENT_BLOCKS_BY_CHAIN` has a `safeProposalHub` entry for that chain.** Without it
      `useVaultProposals` refuses to scan and proposal discovery is silently dead — this exact gap
      shipped once and disabled discovery on every chain.
- [ ] `frontend/src/test/custody/custodyConfig.test.js` passes (it asserts the above).
- [ ] On a test vault: create → attach rules → propose → approve → execute, and confirm a violating
      transaction is refused with a rule-numbered message.

### Brand-new chain (no deployment record yet)

Both scripts create a minimal `deployments/<net>-chain<id>-v2.json` when none exists. Confirm
afterwards that `NETWORK_CONTRACTS` in `frontend/src/config/contracts.js` gained a record for that
chain id — a chain with no record resolves every address to `undefined`, which the UI reports as
"unavailable on this network" (honest, but not what you intended after a deploy).

## Supporting members

### "My transaction was blocked"

The revert is a typed error naming the rule. In the UI the member sees, e.g., *"Rule 002 needs 2 of
its named approvers — 1 so far."* To diagnose without any special access:

```js
// Any read RPC; no keys needed.
const guard = new ethers.Contract(GUARD_V2, SAFE_POLICY_GUARD_V2_ABI, provider)
await guard.getRules(vaultAddress)                  // the ordered rules
await guard.matchTransaction(vault, to, value, data) // which rule governs by scope
await guard.previewTransaction(vault, to, value, data, 0, executor, txHashOrZero)
```

Common causes, in the order they usually apply:

| Symptom | Cause |
|---|---|
| `NoRuleMatches` | No rule covers this asset/amount/destination. Once a policy exists, silence is denial — the vault needs a rule (or a catch-all) added. |
| `RuleApproversMissing` | The governing rule names owners who have not all approved — **or** names someone who is no longer an owner (that rule can never pass until amended). |
| `RulePerTxExceeded` / `RuleWindowExceeded` | Over the governing rule's limit. Windows are fixed-reset 24 h and restart when the rule set changes. |
| `DelegatecallBlocked` | A batched (MultiSend) transaction. Policy vaults cannot delegatecall; submit the calls individually. |
| `CooldownActive` | The vault's policy-wide delay between fund movements has not elapsed. |

### "We're locked out"

You are not. Transactions to the vault itself (owner/threshold/guard changes) and to the guard
(policy changes) bypass all fund rules. The owners propose `setRules` with a looser policy, approve
to threshold, and execute. If they want the engine off entirely, they propose `setGuard(0)`.

Never offer to "fix" a vault's policy for them — you cannot, and any such promise is false.

### "We want to move to ordered rules"

From no policy, or from the v1 engine, it is a **two-step, both threshold-approved**:

1. `setRules(...)` on the V2 guard — inert until step 2 (the guard is not yet this vault's guard).
2. `setGuard(<V2 guard>)` on the vault — the rules take effect the moment this executes.

The UI proposes both at consecutive nonces so the chain enforces the order. They must be approved
and executed in order. A v1 policy's state stays on the v1 guard, inert, and is not deleted.

## Monitoring

Events worth alerting on (none require an indexer — they are plain logs):

- `RulesSet(safe, ruleCount, cooldown, rulesVersion)` — a vault's policy changed.
- `RuleConfigured(safe, index, …)` — one rule per event, so a policy can be reconstructed from logs
  alone without an archive read.

There is nothing to page on: the engine has no liveness dependency, no funds, and no upgrade path.
A chain outage degrades the vault list per-row (the UI says which chain is unreachable) and clears
when the RPC returns.

## Incident notes

- **Suspected bug in rule evaluation.** The guard cannot be paused, and that is deliberate. The
  mitigation available to *members* is to propose `setGuard(0)` (removing enforcement) or a looser
  policy — both threshold-approved. Communicate the specific transaction shapes affected; do not
  advise members to strand funds behind a policy you are unsure of.
- **A new guard version is needed.** Deploy it alongside; existing vaults keep running the old one
  until their owners adopt the new one. There is no fleet-wide migration and there should not be.
