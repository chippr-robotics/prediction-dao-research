# Contract: Opponent Name Resolution (US1)

## `lib/naming/addressName.js` — `deriveAddressName(address)`

Pure, deterministic generator of a two-word display name from an address. Reuses the
`ADJECTIVES`/`NOUNS` vocabulary from `lib/pools/nicknameWords.js` (shared vocabulary only — this is
address-keyed, distinct from the commitment-keyed pool `deriveNickname`).

```
deriveAddressName(address: string) -> {
  adjective: string,
  noun: string,
  label: string,   // `${adjective} ${noun}`
}
```

**Behavior**
- Normalizes the address (lowercase/checksum-safe) before hashing so casing never changes the result.
- `label` is a pure function of the address: same address ⇒ same label (FR-002).
- Returns a stable placeholder-free label for any 20-byte address; throws only on a non-address input.
- MUST NOT read chain, storage, or network.

## `hooks/useOpponentName.js` — `useOpponentName(address)`

Resolves one address to a display identity in priority order.

```
useOpponentName(address: string, opts?: { chainId?: number }) -> {
  displayName: string,
  source: 'addressBook' | 'ens' | 'generated',
  address: string,
  isLoading: boolean,   // ENS in flight; displayName already holds the generated fallback
}
```

**Resolution order**: `useAddressBook().findByAddress(address, chainId)` nickname → 
`useEnsReverseLookup(address).ensName` → `deriveAddressName(address).label`. First non-empty wins.
Never returns an empty/raw-address `displayName`; the generated fallback is always available
synchronously so no card shows a spinner in place of a name.

## `components/fairwins/OpponentName.jsx`

Presentational component; the only opponent renderer used by `WagerCard`/`WagerTable`.

```
<OpponentName address={string} isSelf={boolean} />
```

**Behavior / a11y**
- Renders "You" when `isSelf` (bypasses resolution).
- Otherwise renders `useOpponentName(address).displayName` inside a real `<button>` with an
  accessible label (e.g. `aria-label="Show full address for {displayName}"`).
- On click/Enter/Space toggles reveal of the full `address` with a copy affordance (FR-003).
- Reveal state is local; conveyed by text (not color alone). Meets WCAG 2.1 AA.
