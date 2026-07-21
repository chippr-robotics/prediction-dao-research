# The Two-Facet Proxy: Beating the 24 KB Contract-Size Limit

*How FairWins added sixteen gasless entrypoints to a contract with 116 bytes of headroom — without adopting a Diamond*

| | |
|---|---|
| **Series** | Contract Architecture (part 2) |
| **Part** | 2 of 3 |
| **Audience** | Solidity engineers hitting the EIP-170 size ceiling |
| **Tags** | `eip170`, `proxy`, `delegatecall`, `facets`, `solidity`, `diamond-adjacent` |
| **Reading time** | ~9 minutes |

---

## 116 bytes of headroom

Every ambitious protocol eventually meets the same compiler output:

```
Warning: Contract code size is 24460 bytes and exceeds 24576 bytes (a limit
introduced in Spurious Dragon). This contract may not be deployable on Mainnet.
```

Except in our case it wasn't a warning yet. When FairWins started spec 035 — platform-wide gasless intents — the `WagerRegistry` implementation compiled to **24,460 of 24,576 bytes**. That's 116 bytes of headroom. The feature called for roughly sixteen new signer-attributed entrypoints: a `…WithSig` or `…WithAuthorization` twin for every core action (create, accept, claim, refund, draw, decline, declare-winner, and the open-challenge variants), each carrying EIP-712 verification, replay-nonce bookkeeping, and for the money-in paths an atomic EIP-3009 stake pull plus optional fee netting.

Sixteen entrypoints do not fit in 116 bytes. They don't fit in 2 KB. And the usual escape hatches all had problems. Cranking optimizer runs down shrinks bytecode but taxes every user's gas forever. External libraries move code out, but retrofitting `DELEGATECALL`-linked libraries across a live, audited escrow contract is invasive surgery. Deploying the intent surface as a *separate contract* at a *separate address* breaks the thing that matters most: the registry is a UUPS proxy at a **stable address** — one ABI, one event stream for the subgraph, one EIP-712 domain that thousands of already-signed intents verify against.

The limit itself is [EIP-170](https://eips.ethereum.org/EIPS/eip-170): since the Spurious Dragon hardfork, deployed runtime code is capped at `0x6000` (24,576) bytes, so that a `CALL` can never force a node to load unboundedly large code from disk. It is not going away, and Polygon — FairWins' flagship network — enforces it like mainnet does.

What shipped instead is a pattern we'd describe as *diamond-adjacent*: **one proxy, two implementations, one storage definition**.

## One proxy, two facets

The registry today is three contracts in `contracts/wagers/`:

| Contract | Role |
|---|---|
| `WagerRegistryCore.sol` | Abstract base: **the** storage layout plus every internal action body. Both facets inherit it. |
| `WagerRegistry.sol` | The main facet — the actual UUPS implementation. Every pre-existing external function, plus a `fallback()`. |
| `WagerRegistryIntents.sol` | The extension facet — the `…WithSig`/`…WithAuthorization` twins, fee-netting admin/getters, and relocated cold paths. |

The proxy (a standard ERC-1967/UUPS proxy from spec 025) points at `WagerRegistry`. A call to a known selector — `createWager`, `acceptWager`, `claimPayout` — dispatches normally inside the main facet, exactly as before the split. A call to a selector the main facet *doesn't* define lands in its fallback, which forwards the raw calldata to the second implementation:

```solidity
/// @custom:oz-upgrades-unsafe-allow delegatecall
fallback() external {
    address ext = intentExtension;
    if (ext == address(0)) revert UnknownFunction();
    assembly {
        calldatacopy(0, 0, calldatasize())
        let ok := delegatecall(gas(), ext, 0, calldatasize(), 0, 0)
        returndatacopy(0, 0, returndatasize())
        switch ok
        case 0 { revert(0, returndatasize()) }
        default { return(0, returndatasize()) }
    }
}
```

Because this is a `delegatecall` from code *already executing in the proxy's context*, the extension facet runs against the proxy's storage, emits events attributed to the proxy's address, and — critically for signed intents — sees `address(this)` as the proxy. The EIP-712 domain (`"FairWins WagerRegistry"`, version `"1"`, chainId, verifying contract) is therefore identical whether a function lives in facet one or facet two. Callers see a single contract.

Which functions went where was a deliberate sort. The intent twins obviously live in `WagerRegistryIntents`. But the split also bought headroom by relocating **cold paths** out of the main facet: `batchExpireOpen`, `autoResolveFromPolymarket`, and `autoResolveFromOracle` are keeper-style functions with no latency-sensitive callers, so they moved behind the fallback with byte-identical behavior. Even three view getters (`feeNettingEnabled`, `gasFeeRecipient`, `maxGasFee`) sit in the extension purely for main-facet code-size headroom. Hot user paths stay in the main facet and pay zero extra dispatch cost; only relayed intents and keeper calls pay the one extra `DELEGATECALL` hop.

## The storage discipline that makes it safe

Two implementations executing against one storage layout is exactly the failure mode that bricks proxies. The defense is structural, not procedural: **the layout is defined once**, in `WagerRegistryCore`, and both facets inherit it. From the base contract's own header:

> BOTH facets execute against the SAME proxy storage, so both MUST inherit this exact contract — the storage layout is defined once, here, and can never drift between facets.

`WagerRegistryCore` also holds every internal action body (`_createWager`, `_acceptWager`, `_claimPayout`, …), each taking the acting identity as an explicit parameter instead of reading `msg.sender`. The self-submit externals in the main facet pass `msg.sender`; the intent twins pass the recovered signer. One body, two attributions — the "twin invariant" — so checks and effects can't drift between the gasless and self-submit paths any more than storage can.

The usual UUPS rules still apply on top: storage is append-only above a trailing `uint256[45] private __gap` (it shrank 48 → 45 when spec 035 appended the packed fee-netting scalars and the `intentExtension` slot). The intent replay-nonce map deliberately lives elsewhere — in `contracts/upgradeable/SignerIntentBase.sol`, which uses **ERC-7201 namespaced storage** at a fixed keccak-derived slot, costing zero gap slots and making the mixin safe to add to an already-live proxy.

Discipline you can't verify is hope. So `npm run check:storage-layout` — the CI-gating script from part 1 of this series — grew a facet-pair mode in `scripts/deploy/check-storage-layout.js`:

```javascript
// Facet pairs sharing ONE proxy's storage (spec 035): the extension facet is
// delegatecalled from the main facet's fallback, so its storage layout MUST be
// compatible with the main implementation's.
const FACET_PAIRS = [
  { main: "WagerRegistry", facet: "WagerRegistryIntents" },
];
```

It runs OpenZeppelin's `upgrades.validateUpgrade(MainFactory, FacetFactory, { kind: "uups" })` — treating the facet as if it were an upgrade of the main implementation, so any sequential-slot drift fails CI before it can ship. The check is intentionally one-directional: the extension additionally carries `SignerIntentBase`'s ERC-7201 namespace, which the main facet legitimately does not declare, and a namespaced slot can never collide with sequential or gap slots.

Two smaller honesty notes baked into the code. The extension facet is annotated `@custom:oz-upgrades-unsafe-allow missing-initializer` — by design it is *never* initialized; the proxy is initialized exactly once through the main facet, and `UUPSManaged`'s constructor disables initializers on the bare implementations. And the fallback's `delegatecall` carries `@custom:oz-upgrades-unsafe-allow delegatecall`, an explicit acknowledgment rather than a suppression of a surprise.

## Governance: routing is upgrading

Pointing the fallback at new code is equivalent in authority to replacing the implementation — the extension runs with full access to the proxy's storage. So the wiring function is gated accordingly:

```solidity
function setIntentExtension(address extension) external onlyRole(UPGRADER_ROLE) {
    intentExtension = extension;
    emit IntentExtensionUpdated(extension);
}
```

`UPGRADER_ROLE` — the same role that authorizes UUPS upgrades, held by the air-gapped floppy-keystore admin — controls the extension pointer. Setting it to zero disables the entire intent surface (the fallback reverts with `UnknownFunction`), which doubles as a kill switch: because every gasless flow keeps a self-submit twin, turning the facet off degrades the product to "users pay their own gas," never to "users are stranded."

## Developer experience: one ABI at one address

Tooling sees one contract. The test helper `test/helpers/proxy.js` exports `deployWagerRegistry`, which deploys the main implementation behind an `ERC1967Proxy`, deploys `WagerRegistryIntents`, wires `setIntentExtension` as the admin, and returns an ethers `Contract` bound to the proxy address with a **merged ABI** — `mergeAbis(Impl.interface, IntentsImpl.interface)`, deduplicating fragments and dropping constructors and fallbacks. Tests and integrators call `registry.acceptWagerWithAuthorization(...)` and `registry.acceptWager(...)` on the same object without knowing a facet boundary exists. The subgraph needs no changes at all: every event still originates from the proxy address.

## Why not a full Diamond?

[EIP-2535](https://eips.ethereum.org/EIPS/eip-2535) (Diamonds) is the canonical answer to "my contract won't fit," and it deserves an honest comparison rather than a strawman.

A Diamond gives you a generic selector-to-facet mapping, `diamondCut` for per-selector upgrades, loupe functions for on-chain introspection, and effectively unlimited facets. If we expected the registry to keep growing indefinitely across many independently-upgraded modules, that machinery would earn its cost.

We chose against it for four concrete reasons:

1. **We already had a proxy standard.** The registry was a shipped UUPS proxy at a stable address (spec 025), with deploy tooling, an upgrade runbook, and CI validation built around `hardhat-upgrades`. Migrating to a Diamond proxy would have meant replacing working, audited infrastructure to solve a code-size problem — maximum blast radius for the actual requirement.
2. **Tooling and verification.** OpenZeppelin's upgrade-safety validators understand UUPS; they don't validate diamonds. Our facet-pair check reuses `validateUpgrade` unchanged. Block-explorer verification and ABI handling for diamonds remain rougher than "one implementation plus one extension."
3. **Hot paths stay on normal dispatch.** A Diamond routes *every* call through the fallback and a selector-mapping `SLOAD`. In the two-facet design, `createWager` and `claimPayout` dispatch directly in the main facet exactly as before; only the relayed and keeper paths pay the extra hop.
4. **Audit surface.** A Diamond's cut logic, selector registry, and loupe are their own attack surface with their own history of subtle bugs. Our routing layer is twelve lines of assembly plus one role-gated setter.

The trade-offs cut the other way too, and it's worth being plain about them. The two-facet pattern has **no on-chain introspection** — nothing enumerates which selectors the extension serves; the merged ABI is an off-chain convention. Selector precedence is implicit: if both facets defined the same function, the main facet would silently win, because the fallback only fires for selectors the main facet lacks (the shared `WagerRegistryCore` base and interface definitions make an accidental collision a compile-time conflict in practice, but the proxy itself doesn't check). Facet upgrades are all-or-nothing per facet, not per selector. And the pattern scales awkwardly past two or three facets — a chain of fallbacks is a worse Diamond, not a better one. If the extension facet itself ever approaches 24 KB, the right move is probably a real Diamond, and we'd rather make that call then than pre-pay for it now.

For one contract, one overflow, and a hard requirement to preserve a live address, ABI, event stream, and EIP-712 domain: two facets, one storage core, and a CI gate was the smallest design that is actually safe.

*FairWins wagers settle from public-information outcomes via external oracles; participants remain subject to applicable law and compliance obligations in their jurisdictions.*

## Design decisions

- **Split by temperature, not just by feature.** The extension facet took the new intent twins *and* relocated cold paths (`batchExpireOpen`, `autoResolveFrom*`) and even three view getters, maximizing main-facet headroom while keeping user-facing hot paths on direct dispatch.
- **One storage definition, enforced twice.** Both facets inherit `WagerRegistryCore` (structural guarantee); `check:storage-layout` validates the pair with `validateUpgrade` in CI (mechanical guarantee). Neither alone is sufficient — inheritance can't catch a facet compiled from a stale branch; a script can't stop someone declaring state in a facet unless the convention exists.
- **New cross-cutting state goes in ERC-7201 namespaces.** `SignerIntentBase`'s nonce map costs zero gap slots and is safe to add to live proxies — the same trick `EIP712Upgradeable` uses.
- **Routing authority equals upgrade authority.** `setIntentExtension` is `UPGRADER_ROLE`-gated because a delegatecall target with full storage access *is* an implementation, whatever you call it.
- **Zero-address as kill switch, backed by the never-stranded rule.** Disabling the facet degrades gracefully because every gasless entrypoint has a self-submit twin.

## Sources

- `contracts/wagers/WagerRegistry.sol` — main facet, fallback delegatecall, `setIntentExtension`
- `contracts/wagers/WagerRegistryIntents.sol` — extension facet: intent twins, relocated cold paths, fee-netting admin
- `contracts/wagers/WagerRegistryCore.sol` — shared storage layout + actor-threaded internal action bodies, `__gap` history
- `contracts/upgradeable/SignerIntentBase.sol` — ERC-7201 namespaced replay-nonce mixin
- `scripts/deploy/check-storage-layout.js` — `FACET_PAIRS` validation (`npm run check:storage-layout`)
- `test/helpers/proxy.js` — `deployWagerRegistry` + `mergeAbis` merged-ABI helper
- `docs/developer-guide/gasless-intents.md` — facet-split architecture table, pre-split size (24,460 / 24,576 bytes)
- `specs/035-intent-based-payments/` — spec, plan, research for the gasless-intent feature
- [EIP-170: Contract code size limit](https://eips.ethereum.org/EIPS/eip-170)
- [EIP-2535: Diamonds, Multi-Facet Proxy](https://eips.ethereum.org/EIPS/eip-2535)
- [ERC-7201: Namespaced Storage Layout](https://eips.ethereum.org/EIPS/eip-7201)
- [OpenZeppelin Upgrades plugin](https://docs.openzeppelin.com/upgrades-plugins/) — `validateUpgrade` used for facet-pair checking
