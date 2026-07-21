# One Salt, Three Chains: What Deterministic Deployment Actually Buys You

*How FairWins uses the Safe Singleton Factory for stable addresses across Mordor, Polygon, and Amoy — and why a per-chain resolver is still non-negotiable*

| | |
|---|---|
| **Series** | Contract Architecture, part 3 |
| **Audience** | Protocol engineers, DevOps |
| **Tags** | `create2`, `deterministic-deployment`, `multi-chain`, `devops` |
| **Reading time** | ~9 minutes |

---

## The Bug That Ships Silently

Picture the failure mode every multi-chain team eventually hits. You redeploy a contract to a testnet — maybe a compiler bump, maybe a constructor tweak. The deploy script prints a fresh address. Someone updates the frontend config. Nobody updates the subgraph manifest. The relay gateway keeps the old address in an environment variable that was set three months ago in a dashboard nobody remembers.

Nothing crashes. The frontend talks to the new contract, the indexer indexes the old one, and the gateway relays transactions into a contract that no longer matches the ABI it was policy-checked against. Users see wagers that "exist" but never index, or gasless transactions that revert with no obvious cause. The bug isn't in any one system — it's in the *drift between them*.

FairWins runs its escrow, membership, and oracle stack on three live EVM networks — Mordor (Ethereum Classic's testnet, chain 63), Polygon Amoy (80002), and Polygon mainnet (137) — with three independent consumers of every contract address: a React frontend, a Graph subgraph, and a relay gateway that sponsors gasless transactions. That's nine opportunities per contract for address drift.

The defense has two layers, and it's worth being precise about what each one does. Deterministic deployment makes addresses *reproducible* — the same deploy script produces the same address, every run, and often the same address on every chain. A single-source-of-truth resolver makes addresses *consistent* — every consumer reads from one record per chain, mechanically. The first layer is the popular one. The second is the one that actually prevents the bug.

## Layer 1: CREATE2 via the Safe Singleton Factory

Ordinary contract creation (`CREATE`) derives the new address from the deployer's address and nonce. Nonces are history: run the same script twice, or on a chain where the deployer has sent one extra transaction, and you get a different address. [EIP-1014](https://eips.ethereum.org/EIPS/eip-1014) added `CREATE2`, which removes history from the equation:

```
address = keccak256(0xff ++ deployer ++ salt ++ keccak256(init_code))[12:]
```

Deployer, salt, init code. Nothing else. If those three inputs are identical on two chains, the address is identical on two chains.

The catch is the `deployer` term. If each chain's deployment EOA calls `CREATE2` through its own throwaway factory, the factory addresses differ and determinism collapses. The standard fix is a *shared* factory that already exists at the same address everywhere. FairWins uses the [Safe Singleton Factory](https://github.com/safe-global/safe-singleton-factory), pinned in `scripts/deploy/lib/constants.js`:

```javascript
/**
 * Safe Singleton Factory address - same on all EVM networks
 * Used for deterministic CREATE2 deployments
 */
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";
```

The factory itself was placed at that address on each network via a presigned deployment transaction (the same family of techniques as [EIP-2470](https://eips.ethereum.org/EIPS/eip-2470)'s keyless deployment). Calling it is trivially simple: send a transaction whose data is `salt ++ init_code`, and it executes `CREATE2` on your behalf. Because the factory is the `deployer` term in the address formula, every chain computes the same result.

The workhorse is `deployDeterministic` in `scripts/deploy/lib/helpers.js`. Before spending any gas, it computes where the contract *will* land and checks whether it's already there:

```javascript
// Compute deterministic address
const initCodeHash = ethers.keccak256(deploymentData);
const deterministicAddress = ethers.getCreate2Address(
  SINGLETON_FACTORY_ADDRESS,
  salt,
  initCodeHash
);

// Check if contract is already deployed
const existingCode = await ethers.provider.getCode(deterministicAddress);
if (existingCode !== "0x") {
  return {
    address: deterministicAddress,
    contract: ContractFactory.attach(deterministicAddress),
    alreadyDeployed: true
  };
}
```

That `getCode` check is the quiet superpower: **idempotency**. Re-running `scripts/deploy/deploy.js` against a network where everything is already deployed is a no-op that attaches to existing contracts instead of minting duplicates. A partially failed deploy can simply be re-run; whatever landed stays put, whatever didn't gets deployed. The helper also enforces the [EIP-3860](https://eips.ethereum.org/EIPS/eip-3860) 49,152-byte initcode limit and warns past the [EIP-170](https://eips.ethereum.org/EIPS/eip-170) 24,576-byte runtime limit before it wastes a transaction finding out on-chain.

Salts are human-readable, versioned strings, hashed via `generateSalt` (`ethers.id`, i.e. `keccak256` of the UTF-8 string). The active deployment uses the prefix recorded in every `deployments/*-v2.json` file:

```
salt = keccak256("FairWins-P2P-v2.0-KeyRegistry")
```

Bump the version prefix and you get a clean, parallel address space for a v3 — old deployments stay untouched and reachable.

One more ergonomic detail: local Hardhat networks obviously don't ship with the factory pre-installed. `ensureSingletonFactory` detects a local chain, funds the factory's one-shot signer address, and replays the presigned deployment transaction from the `@safe-global/safe-singleton-factory` package — so `localhost` and CI exercise the *same* deployment path as production instead of a mock shortcut.

## Where Determinism Actually Holds — and Where It Honestly Doesn't

Here's the part most write-ups skip. "Same address on every chain" has three preconditions — same factory, same salt, same init code — and *init code includes the ABI-encoded constructor arguments*. Look at the recorded deployments and the pattern is textbook:

- **`KeyRegistry`** takes no constructor arguments. It sits at `0xcEFdeBba8E040c035c690ca9057cF22E73247c24` on Mordor, Amoy, *and* Polygon. Full determinism.
- **`SanctionsGuard`** takes an admin and an oracle address. Mordor and Amoy both point at a mock sanctions oracle, so they share `0xdF41355dD5E47FCA4eE2F2205af4C70Dab8C13B3`. Polygon points at the real Chainalysis sanctions oracle (`0x40C579…C8fb`) — different constructor arg, different init code, different address. Working exactly as designed.
- **UUPS proxies** — `wagerRegistry`, `membershipManager`, `wagerPoolFactory` — are *not* CREATE2-deployed at all. A comment in `scripts/deploy/deploy.js` says it plainly: *"unlike the prior CREATE2 deploy this is NOT idempotent — re-running mints a new proxy."* Their address stability comes from a different mechanism entirely: the proxy is deployed once per chain and then never redeployed. Logic changes ship as in-place upgrades through `scripts/deploy/lib/upgradeable.js`, gated by `npm run check:storage-layout` in CI. Stable address, swappable implementation — determinism by *policy*, not by opcode.

This is the honest taxonomy: CREATE2 gives cross-chain address equality only to immutable, argument-free singletons. Everything else gets *per-chain* address stability — which turns out to be what the consumers actually need.

## Layer 2: One Record Per Chain, One Resolver Everywhere

Because addresses can legitimately differ per chain, no consumer is allowed to assume they don't. Every deploy run writes its results to `deployments/<network>-chain<id>-v2.json` — network, deployer, per-contract addresses, constructor args, salt prefix, deploy blocks. The repo treats these files as the source of truth for on-chain addresses, and three consumers hang off them:

**The frontend** never hand-edits addresses. `npm run sync:frontend-contracts` (see `scripts/utils/sync-frontend-contracts.js`) reads the deployment record and rewrites the per-network address maps in `frontend/src/config/contracts.js`, scoped to the right network block. It also re-emits plain-JSON ABIs from the hand-maintained JS ABI modules so downstream consumers read generated artifacts, not hand-copied ones. At runtime, exactly one function resolves addresses:

```javascript
export function getContractAddressForChain(contractName, chainId) {
  if (chainId == null) return getContractAddress(contractName)
  const chainContracts = NETWORK_CONTRACTS[chainId]
  return chainContracts ? chainContracts[contractName] : undefined
}
```

Chain-aware, and honest about absence: Mordor has no Polymarket, Chainlink, or UMA, so those adapter keys simply don't exist in its map and the resolver returns `undefined` — the UI degrades the capability rather than pointing at a wrong address. The landing page's "deployed on" list is even derived from the same maps (`getDeployedNetworks` filters for networks carrying a live `wagerRegistry`), so shipping a new chain updates the marketing surface with zero UI edits.

**The subgraph** keys its manifests off `subgraph/networks.json`, which carries the same per-network addresses and start blocks as the deployment records.

**The relay gateway** is the strictest consumer. `services/relay-gateway/src/config/index.js` reads the `deployments/*-chain<ID>-v2.json` files directly at boot, and refuses to start if any enabled chain is missing a record with `wagerRegistry`, `membershipManager`, and `sanctionsGuard` addresses. The comment in the file states the policy: *fail loudly — never run against a stale/unknown target*. A gateway that sponsors gas for user transactions must never relay into a contract it can't identify; a crash at boot is infinitely cheaper than a policy check against the wrong bytecode.

Same information, three consumption styles — regenerated config for the frontend, manifest data for the indexer, boot-time validation for the gateway — but a single upstream artifact per chain.

## Design Decisions

**Safe Singleton Factory over a bespoke deployer.** Rolling a custom CREATE2 factory means custody of a deployer key per chain and a new audit surface. The Safe factory already exists at one address across the EVM networks FairWins targets (including Mordor — a useful test, since niche chains are where presigned-deployment schemes usually break), and it's the same infrastructure Safe itself relies on.

**Idempotent scripts over deployment ceremony.** The `getCode`-then-attach pattern means "deploy" and "verify the deployment exists" are the same command. There is no separate resume path to maintain, and CI can run the real deploy script against a fresh Hardhat chain on every push.

**Recorded addresses over computed addresses.** A tempting shortcut is to have consumers *compute* CREATE2 addresses instead of reading a record. FairWins deliberately doesn't: proxies aren't CREATE2, constructor args vary by chain, and a computed address tells you where a contract *would* be, not that the right bytecode is actually there. The `deployments/` records capture what was verifiably deployed; the resolver distributes that fact.

**Per-chain resolution as a hard rule.** Even for `KeyRegistry` — genuinely identical on all three chains today — code goes through `getContractAddressForChain`. Hardcoding "it's the same everywhere" bakes today's coincidence into tomorrow's outage the first time a chain needs a divergent deploy.

The trade-offs are real: the singleton factory is a dependency you don't control (if a future chain lacks it, someone must fund and replay the presigned deployment first); byte-identical init code requires compiler and metadata discipline; and CREATE2 determinism simply doesn't extend to upgradeable proxies, which carry their own upgrade-governance burden instead. Deterministic deployment is a tool, not a doctrine — the resolver is the doctrine.

## Sources

- `scripts/deploy/lib/helpers.js` — `deployDeterministic`, `generateSalt`, `ensureSingletonFactory`
- `scripts/deploy/lib/constants.js` — `SINGLETON_FACTORY_ADDRESS`, per-network token/oracle addresses
- `scripts/deploy/deploy.js` — v2 deployment orchestration, salt prefix `FairWins-P2P-v2.0-`, proxy non-idempotency notes
- `scripts/deploy/lib/upgradeable.js` + `scripts/deploy/check-storage-layout.js` — in-place UUPS upgrades
- `scripts/utils/sync-frontend-contracts.js` — deployment-record → frontend config/ABI sync
- `deployments/mordor-chain63-v2.json`, `deployments/amoy-chain80002-v2.json`, `deployments/polygon-chain137-v2.json` — recorded addresses compared above
- `frontend/src/config/contracts.js` — `getContractAddressForChain`, `getDeployedNetworks`, per-network maps
- `services/relay-gateway/src/config/index.js` — boot-time deployment-record validation
- `subgraph/networks.json` — per-network subgraph addresses
- `docs/developer-guide/singleton-deployment-patterns.md` — pattern research and alternatives survey
- [EIP-1014: Skinny CREATE2](https://eips.ethereum.org/EIPS/eip-1014)
- [EIP-2470: Singleton Factory](https://eips.ethereum.org/EIPS/eip-2470)
- [EIP-170: Contract code size limit](https://eips.ethereum.org/EIPS/eip-170), [EIP-3860: Limit and meter initcode](https://eips.ethereum.org/EIPS/eip-3860)
- [Safe Singleton Factory](https://github.com/safe-global/safe-singleton-factory)
- [OpenZeppelin proxy documentation](https://docs.openzeppelin.com/contracts/5.x/api/proxy) (UUPS / ERC-1967)
