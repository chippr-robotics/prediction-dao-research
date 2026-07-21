# TokenFactory: Minting From Vetted Templates, Not Arbitrary Bytecode

*How FairWins lets authorized issuers mint their own ERC-20s, ERC-721s, and restricted tokens without ever deploying unaudited code — and what that constraint buys you*

| | |
|---|---|
| **Series** | FairWins Engineering |
| **Part** | 34 — TokenFactory: templated token minting |
| **Audience** | Solidity / web3 engineers, protocol integrators |
| **Tags** | solidity, erc20, erc1404, minimal-proxy, upgradeable, factory-pattern |
| **Reading time** | ~9 minutes |

---

## The token nobody audited

An issuer on the platform wants to spin up a fungible token — say, a points balance for a community, or a restricted instrument that only vetted wallets can hold. The naive path is familiar: write a Solidity contract, compile it, deploy the bytecode, hope it does what the constructor comment claims.

That path is a problem the moment more than one person relies on it. Whose eyes were on the transfer hook? Did the `mint` function check the sanctions list, or did it quietly skip it? When the platform's frontend later renders a "Holders" tab or an "Activity" feed for that token, is it reading a real ERC-20, or something that *looks* like one until the third `transferFrom`? Arbitrary bytecode deployment means every new token is a fresh, un-reviewed attack surface, and every downstream consumer — the subgraph, the wallet UI, the sanctions screen — has to defensively assume the worst.

FairWins takes the opposite stance. There is exactly one contract on each network authorized to bring tokens into existence: `contracts/tokens/TokenFactory.sol`. It does not accept bytecode. It does not `CREATE2` whatever an issuer hands it. It clones from a small, fixed set of implementation templates that the platform team wrote, audited, and pinned — and it stamps a sanctions screen into every one on the way out the door.

This post walks through what that template model constrains, why the constraint is worth it, and how a new template gets added when the fixed set needs to grow.

## One authority, a handful of templates

The factory is the single upgradeable, state-bearing contract for token issuance. Everything it emits is an immutable minimal-proxy clone. The design splits cleanly along that line: the *authority* can be upgraded and re-templated; the *tokens* it produces can never change their own logic.

The template set is deliberately short. Each supported standard has a v1 (Ownable) template and a v2 (role-based) template:

| Standard | v1 template | v2 template | Character |
|---|---|---|---|
| Open ERC-20 | `OpenERC20` | `OpenERC20V2` | Fungible; burnable/pausable flags; optional supply cap (v2) |
| Open ERC-721 | `OpenERC721` | `OpenERC721V2` | NFT; per-token URIs; batch mint |
| Restricted ERC-1404 | `RestrictedERC20` | `RestrictedERC20V2` | Eligibility allowlist + restriction codes + freeze |
| Permissioned ERC-3643 (T-REX) | — | — | **Deferred** (see below) |

That is the entire menu. An issuer picks a standard and a few parameters — name, symbol, decimals, supply, a cap, an eligibility list — and gets back a token address. They never choose *code*. The `TokenStandard` enum in `contracts/tokens/interfaces/ITokenFactory.sol` enumerates exactly what can be minted, and a value with no configured template simply reverts.

The clone mechanism is OpenZeppelin's EIP-1167 minimal proxy (`Clones.clone`). Each `create*` call deploys a ~45-byte proxy that `DELEGATECALL`s a shared, already-audited implementation, then calls a one-time `initialize` to set the token's own storage. The implementation itself is initialization-locked in its constructor (`_disableInitializers()`), so the master copy can never be hijacked — only cloned.

## What gets stamped in on the way out

The factory's issuance path is not a pass-through. Before any clone happens, `_beforeCreate` runs three checks that no issuer can opt out of:

```solidity
function _beforeCreate(
    string calldata name,
    string calldata symbol,
    address impl,
    TokenStandard standard
) internal view {
    if (bytes(name).length == 0 || bytes(symbol).length == 0) revert EmptyMetadata();
    if (impl == address(0)) revert TemplateNotSet(standard);
    ISanctionsGuard guard = sanctionsGuard;
    if (address(guard) != address(0) && !guard.isAllowed(msg.sender)) revert SanctionedAddress(msg.sender);
}
```

Metadata must be non-empty. A template must be configured for the requested standard. And the issuer must pass the platform's shared `ISanctionsGuard` — fail-closed, the same screen the rest of FairWins uses, not a parallel bespoke one. Issuance itself is gated behind `TOKEN_ISSUER_ROLE`, granted out-of-band by the platform admin; holding a wallet is not enough to mint.

The screen does not stop at creation. Every template injects that same `sanctionsGuard` reference into the token it clones, and every token re-checks it on every transfer inside its `_update` hook — skipping only the zero endpoint so mints and burns are screened on their one real party. Here is the open ERC-20's hook:

```solidity
function _update(address from, address to, uint256 value)
    internal override(ERC20Upgradeable, ERC20PausableUpgradeable)
{
    ISanctionsGuard guard = sanctionsGuard;
    if (address(guard) != address(0)) {
        if (from != address(0) && !guard.isAllowed(from)) revert SanctionedAddress(from);
        if (to != address(0) && !guard.isAllowed(to)) revert SanctionedAddress(to);
    }
    super._update(from, to, value);
}
```

Because the template is the only code an issuer can deploy, the platform *knows* this check exists in every token it has ever minted. That is the whole point of refusing arbitrary bytecode: a property proven once on the template holds for the entire population of clones. Sanctions are non-bypassable not because of policy, but because there is no code path that omits them.

The restricted ERC-1404 template pushes the same idea further. It evaluates a transfer policy most-restrictive-first — sanctioned, then frozen, then not-eligible — and, critically, the pre-transfer detector and the enforcing hook call the *same* internal function:

```solidity
function _detect(address from, address to) internal view returns (uint8) {
    ISanctionsGuard guard = sanctionsGuard;
    if (address(guard) != address(0)) {
        if (from != address(0) && !guard.isAllowed(from)) return SANCTIONED;
        if (to != address(0) && !guard.isAllowed(to)) return SANCTIONED;
    }
    if (from != address(0) && frozen[from]) return SENDER_FROZEN;
    if (from != address(0) && !eligible[from]) return SENDER_NOT_ELIGIBLE;
    if (to != address(0) && !eligible[to]) return RECIPIENT_NOT_ELIGIBLE;
    return SUCCESS;
}
```

`detectTransferRestriction` (the ERC-1404 view a UI calls before offering a transfer) and `_update` (the hook that actually reverts) both route through `_detect`. A pre-check that says "this will succeed" and a transfer that then fails is a whole class of bug the template design forecloses by construction.

## The registry: discovery without trusting the tokens

Cloning solves creation. Discovery is the other half. If tokens are just addresses floating on-chain, how does a frontend enumerate "everything this issuer minted" without an indexer, and how does anything know a given address came from the factory at all?

The factory keeps a network-scoped registry. Every successful creation appends a `TokenRecord` — id, standard, address, issuer, metadata, flags, timestamp — and updates a reverse lookup:

```solidity
id = ++tokenCount;
_tokens[id] = TokenRecord({ /* ...standard, tokenAddress, issuer, name, symbol... */ });
_issuerTokens[msg.sender].push(id);
tokenAddressToId[token] = id;
emit TokenCreated(id, standard, token, msg.sender, name, symbol);
```

`getTokenIdByAddress(token)` returning non-zero is a provenance proof: this address is a factory clone, not an impostor. `getTokensByIssuer(issuer)` powers the "My Tokens" view directly from chain on networks without a subgraph. And the registry write happens *after* the clone-and-init succeeds — checks-effects-interactions applied to issuance, so a revert mid-creation never leaves a phantom row.

## Design decisions

**Templates over arbitrary bytecode.** The obvious cost is flexibility: an issuer cannot ship a token with a novel bonding curve or a custom rebasing rule. The obvious benefit is that the platform can make and keep guarantees across *every* token it has issued — sanctions are enforced, the ERC-1404 detector matches its hook, the ABI the frontend loads is the ABI the contract actually has. For a platform whose wallet, subgraph, and compliance surface all consume these tokens, that uniformity is worth more than open-ended expressiveness. Arbitrary deployment would push the audit burden onto every reader; templates pay it once.

**Immutable tokens, upgradeable factory.** Only `TokenFactory` is UUPS-upgradeable (via the shared `UUPSManaged` base, with append-only storage gated by `npm run check:storage-layout` in CI). Issued clones are immutable — a holder's token cannot have its rules changed out from under them by a later upgrade. Fixing template logic means registering a *new* template for *future* mints, never rewriting existing tokens. The v2 role-based templates were added exactly this way: three new implementation slots appended to storage (consuming reserved `__gap` space), new `create*V2` entrypoints, and a `setV2Template` admin call. Existing v1 Ownable tokens were untouched.

**Adding or replacing a template is an admin operation, not a user one.** `setTemplate` and `setV2Template` are `onlyRole(DEFAULT_ADMIN_ROLE)` and reject `address(0)`. A new template class is a deliberate, reviewed, append-only factory upgrade — the implementation is written, audited (Slither and Medusa run in CI with clone/proxy/UUPS/AccessControl detectors), deployed once as a locked master, and only then registered. The audit story is *because* the surface is small: three standards, two variants each, is a set a human can actually review, unlike an open firehose of user bytecode.

**Deferring rather than faking ERC-3643.** The permissioned security-token class is intentionally *not* shipped. The canonical T-REX suite pins OpenZeppelin 4.x and Solidity 0.8.17, incompatible with this repo's OZ 5.4.0 pin (chosen as the newest ETC/Mordor-compatible release — OZ ≥ 5.5 needs the Cancun `mcopy` opcode pre-Cancun ETC lacks). Rather than ship a broken or downgraded implementation, the `PERMISSIONED_ERC3643` enum value and the `TokenRecord.suite` field are *reserved* so the registry layout stays forward-stable, and the class lands only when an OZ-5-native suite exists. Honest absence beats a template nobody can stand behind.

## Where it runs

`TokenFactory` is deployed behind a UUPS proxy on Mordor (ETC testnet, chain 63) and Polygon (chain 137); the proxy and implementation addresses are recorded in `deployments/`, which is the source of truth. The frontend self-disables its Tokens tab on any network without a deployed `tokenFactory`, so there is no UI promising issuance where the authority does not exist.

The template model is not glamorous. It says no to a lot of things an issuer might want to do. But it is precisely that refusal — no arbitrary code, one screened path in, a short auditable menu of what comes out — that lets everything downstream treat a FairWins-minted token as a known quantity.

## Sources

- `contracts/tokens/TokenFactory.sol` — factory authority, registry, `create*`/`setTemplate`/`_beforeCreate`
- `contracts/tokens/interfaces/ITokenFactory.sol` — `TokenStandard` enum, `TokenRecord`, events, errors
- `contracts/tokens/templates/OpenERC20.sol` — open fungible clone template + `_update` sanctions hook
- `contracts/tokens/templates/RestrictedERC20.sol` — ERC-1404 template, `_detect` shared policy
- `docs/developer-guide/token-mint.md` — standards table, v2 roles/caps, deploy/sync, deferral notes
- `specs/028-token-mint/` — spec, `contracts/token-factory.md`, `data-model.md`
- `deployments/mordor-chain63-v2.json`, `deployments/polygon-chain137-v2.json` — recorded proxy/impl addresses
- EIP-1167 Minimal Proxy Contract — https://eips.ethereum.org/EIPS/eip-1167
- ERC-1404 Simple Restricted Token Standard — https://erc1404.org / https://github.com/ethereum/EIPs
- OpenZeppelin Contracts (Clones, ERC20, AccessControl, UUPS) — https://docs.openzeppelin.com/contracts/5.x/
