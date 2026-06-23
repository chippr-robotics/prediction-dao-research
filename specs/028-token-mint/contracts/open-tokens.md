# Contract: Open Token Templates (ERC-20 / ERC-721 clones)

OZ-based, initializable clone templates deployed once and cloned per issued token by `TokenFactory`. Modernizes
the archived `TokenMintFactory` implementations by adding non-bypassable sanctions screening. Maps to
FR-001–003, FR-016/FR-018–021, User Stories 1 & 2.

## Templates

| Template | Base | Capabilities |
|----------|------|--------------|
| `OpenERC20` (basic) | `ERC20` + `Ownable` | owner `mint`; standard transfer |
| `OpenERC20` burnable | + `ERC20Burnable` | holder `burn` |
| `OpenERC20` pausable | + `ERC20Pausable` | owner `pause`/`unpause` |
| `OpenERC20` burnable+pausable | + both | both |
| `OpenERC721` (basic) | `ERC721` + `ERC721URIStorage` + `Ownable` | owner `mint(to, uri)` |
| `OpenERC721` burnable | + `ERC721Burnable` | holder `burn` |

> The four ERC-20 variants and two ERC-721 variants may be realized as distinct template contracts (as in the
> archive) or via constructor/init flags; the factory holds one impl address per variant either way.

## Initialization (clone, once)

```
initialize(string name, string symbol, uint8 decimals /*ERC20*/, uint256 initialSupply /*ERC20*/, address owner, address sanctionsGuard)
```

- Guarded so a clone initializes exactly once; the **template** itself is locked (`_initialized` / disabled).
- Sets owner, optional initial supply minted to owner, and stores the `sanctionsGuard` reference.

## Administration (`onlyOwner`)

- `mint(to, amount)` (ERC-20) / `mint(to, uri)` (ERC-721).
- `pause()` / `unpause()` (pausable variants only).
- `burn` is holder-initiated (burnable variants).
- Ownership transfer via OZ `Ownable` (FR-020).

## Non-bypassable sanctions (transfer hook)

In `_update(from, to, value)` (ERC-20) / `_update(to, tokenId, auth)` (ERC-721): fail-closed
`sanctionsGuard.isAllowed(from)` and `isAllowed(to)` (skipping the zero endpoint for mint/burn). When
`sanctionsGuard == address(0)`, screening is disabled (deliberate per-network config, mirroring the rest of the
platform). Reverts a screened-out transfer (FR-021).

## Admin surface gating (FR-018)

A non-pausable token exposes no pause control; a non-burnable token exposes no burn. The frontend reads the
token's capabilities (variant) and renders only valid controls; on-chain, absent functions simply don't exist.

## Test contracts (acceptance)

- Create each variant; verify supply/owner/metadata and that selected options match exactly (FR-003).
- `mint` increases balance & supply for owner; rejected for non-owner.
- `pause` blocks transfers; `unpause` resumes (pausable only).
- Sanctioned sender or recipient cannot transfer/receive (both directions), for every variant.
- Ownership transfer moves admin authority.
