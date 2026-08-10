# Runbook: hand admin roles to the multisig

Moving `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE` and every other privileged role from the deployer EOA
to the admin Safe, one network at a time.

**This is the most dangerous procedure in the repo.** A mistake here is not "redeploy and try
again" — an AccessControl contract whose last admin renounces is permanently unadministrable, and a
UUPS proxy whose last `UPGRADER_ROLE` holder renounces can never be upgraded again. Read the whole
runbook before running anything.

Tooling: `scripts/ops/transfer-roles.js`. Design notes are in its header.

---

## Before you start

| Check | Why it matters |
|---|---|
| The Safe exists **on this chain** with bytecode | Granting admin to an address that is a Safe elsewhere but nothing here bricks the contract. The script aborts on this, but know it first. |
| You can actually sign with the Safe | 2-of-3 today: the hot EOA and the Ledger sign everywhere; the passkey owner is a contract and signs **only on Polygon**. Off Polygon you need *both* the hot key and the Ledger. |
| Fee services are registered | Renouncing FeeRouter admin with a service unregistered leaves routers reverting `ServiceUnknown` and nobody able to fix it. The script refuses, but plan around it. |
| You are not mid-deploy | Deploy scripts need `DEFAULT_ADMIN_ROLE` on the FeeRouter to register services. Finish deploying, then hand off. |

Current admin Safe: `0x8cc564E3dF4003c2F0a33C679c8DfE6237c5c3fa` (2-of-3, same address on Ethereum,
Optimism, Polygon, Base, Arbitrum, ETC and Mordor). Recorded in `deployments/admin-safe.json`.

---

## The procedure

### 1. Plan — read-only, no transactions

```bash
npx hardhat run scripts/ops/transfer-roles.js --network <net>
```

Prints every managed contract on that network, every role it exposes, and who holds each. Roles are
**discovered from the ABI**, not hardcoded, so a role added later cannot be silently left behind.

Read it. Confirm the contract list matches what you expect that chain to host, and that the EOA
holds what you think it holds.

### 2. Grant — the multisig gains the roles

```bash
MODE=grant CONFIRM=<net> npx hardhat run scripts/ops/transfer-roles.js --network <net>
```

Without `CONFIRM=<net>` this is still a dry run and prints `WOULD GRANT`. With it, each role is
granted and then **re-read from the chain** — a mined receipt is not accepted as proof the role is
held.

After this step **both** the EOA and the multisig hold every role. Nothing is lost yet, and nothing
is protected yet. This is the safe resting state, and it is fine to stay here for a while.

### 3. Verify — independently, and not in the same sitting

Re-run step 1 and confirm every row reads `EOA=yes multisig=yes`.

Then prove the multisig can actually *use* a role, on a low-stakes one first. From the Safe, execute
something harmless and observable — e.g. `setFeeBps` on a service to its current value, or a pause
followed immediately by an unpause on a network with nothing live. If the Safe cannot execute, stop.
You have not lost anything yet; renouncing now is what would make it permanent.

> Do steps 2 and 3 on **Mordor first**. It is a testnet with the same contracts and the same Safe
> address, so a mistake there costs nothing and teaches you the same lesson.

### 4. Renounce — the EOA gives up the roles

```bash
MODE=renounce CONFIRM=<net> npx hardhat run scripts/ops/transfer-roles.js --network <net>
```

For each role the script re-reads the chain and **refuses** unless the multisig verifiably holds it
right now. It does not trust step 2's output, the deployment record, or its own earlier run.

It additionally refuses to renounce `DEFAULT_ADMIN_ROLE` on the FeeRouter while any known fee
service is unregistered.

Restrict the blast radius while you build confidence:

```bash
MODE=renounce ONLY=feeRouter CONFIRM=<net> npx hardhat run scripts/ops/transfer-roles.js --network <net>
```

### 5. Confirm the end state

Re-run step 1. Every row should read `EOA=no multisig=yes`. Anything still showing `EOA=yes` was
skipped for a reason the output states — read it rather than forcing it.

---

## Order of networks

Cheapest and least consequential first, so every mistake is made where it does not matter:

**Mordor 63** (testnet, full rehearsal) → **ETC 61** → **Optimism 10** → **Base 8453** →
**Arbitrum 42161** → **Polygon 137** (most live members) → **Ethereum 1** (most expensive).

Do not batch. One network, verified end to end, before the next.

---

## If something goes wrong

**"multisig does not hold it. Run MODE=grant first"** — working as intended. The grant did not land
for that role. Re-run step 2 and read its output rather than reaching for the renounce.

**"has NO BYTECODE on chain N"** — the Safe is not deployed there. Run
`scripts/ops/deploy-admin-safe.js` for that network first. Do not override with `MULTISIG=` unless
you have verified that address is a live Safe *on that chain*.

**"REFUSING — fee services not registered"** — finish the deploy
(`scripts/ops/register-fee-service.js`, or re-run the router deploy) before handing off the
FeeRouter.

**The EOA renounced but the multisig cannot sign.** There is no recovery. This is the failure the
runbook exists to prevent, which is why step 3 is not optional and why Mordor comes first.

**A grant landed on the wrong address.** Not fatal by itself: the EOA still holds the role at that
point. Revoke the bad grant (`revokeRole`) *before* renouncing anything.

---

## What this does not cover

- **Wager Pools have no pause and no admin.** `WagerPool` clones are immutable and unpausable, and
  the factory's levers cannot reach pools already holding funds. No handoff changes that; it needs
  its own work.
- **The Safe's own owners.** Changing who controls the Safe is a Safe transaction, not this script.
- **Contracts with no AccessControl.** Skipped automatically and reported as such.

Related: [fee operations](./fee-operations.md) · [bridge & liquidity operations](./bridge-liquidity-operations.md) · [Protect policy operations](./protect-policy-operations.md)
