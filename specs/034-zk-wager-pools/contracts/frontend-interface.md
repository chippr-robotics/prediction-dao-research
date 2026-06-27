# Contract Interface: Frontend (Gateway, Nicknames, Settings, Quick Action)

**Feature**: 034-zk-wager-pools | Phase 1 | React + Vite + Vitest

UI contracts for the surfaces this feature adds/changes. Contract addresses/ABIs/network
config come from the generated sync artifacts (`getContractAddressForChain`), never hardcoded
(constitution V).

---

## 1. Quick action (Dashboard)

`frontend/src/components/fairwins/Dashboard.jsx` — add a quick-action tile and a switch case
(FR-008). Tiles are `{ id, category, tag, icon, title, description }` rendered by
`QuickActionCard` → `onAction(id)`; `handleQuickAction` dispatches.

```js
// new tile (Start-a-wager group)
{ id: 'create-pool', category: 'create', tag: 'Group', icon: <…/>,
  title: 'Group Pool', description: 'Open a larger pool — share four words to join' }

// dispatch
case 'create-pool':   navigate('/pools/create'); break;
case 'join-pool':     navigate('/pools/join'); break;   // or fold into create page
```

Routes added under the authenticated `AppLayout` in `frontend/src/App.jsx`:
`/pools/create`, `/pools/join`, `/pools/:poolId`.

---

## 2. 4-word gateway

```ts
// Identity is the language-independent index tuple; rendering uses the active language list.
type WordIndices = [number, number, number, number];   // each 0..2047 (BIP-39)

phraseToIndices(phrase: string, lang: Bip39Lang): WordIndices | null  // parse + validate
indicesToPhrase(idx: WordIndices, lang: Bip39Lang): string            // render
resolvePool(idx: WordIndices): Promise<PoolSummary | null>            // factory.poolByPhrase
```

**Behaviors / states** (FR-004, edge cases):
- Valid phrase → load pool summary (buy-in, members joined, slots remaining) before any funds
  (FR-005).
- Words not in the wordlist, wrong count, or no-match → clear "not found" (not a raw error).
- Pool full/resolved/cancelled → surface that state, don't offer to join (stale-phrase edge).
- Phrase parsed in one language resolves the same pool as in any other (SC-008) — identity is
  the index tuple, not the words.

---

## 3. Two-word nickname (client-side, deterministic)

```ts
// derived from the member's PUBLIC identity commitment so any member can render it; never on-chain
deriveNickname(identityCommitment: bigint, poolId: string): { adjective: string; noun: string }
```

- Deterministic + stable per member per pool (FR-009/FR-011); computed from the public
  commitment (which the subgraph already exposes), so **no separate nickname value is emitted
  or stored on-chain** (FR-009/FR-010).
- Adjective/noun arrays are **versioned** constants; large enough to make in-pool collisions
  rare; collisions disambiguated by a short commitment-derived suffix (FR-012).

---

## 4. My Account — word-list language selector

Lives in the Account settings surface (`AccountDashboard.jsx` → `WalletUtilitiesPanel`).
Persistence follows the existing **device-pref** precedent (`utils/qrColorPreference.js`):
curated enum, validated, graceful fallback; default **English** (FR Assumptions, US-2).

```ts
const SUPPORTED_BIP39_LANGS = ['en','es','ja','fr','it','ko','zh-Hans','zh-Hant','cs','pt']; // ≥4 (SC-008)
getWordListLang(): Bip39Lang   // default 'en'
setWordListLang(lang: Bip39Lang): void
```

The selector drives `indicesToPhrase`/`phraseToIndices` rendering across the gateway. No i18n
framework is introduced (none exists today) — this is a self-contained preference + wordlist
lookup.

---

## 5. Proof generation (in-browser, lazy)

```ts
// @semaphore-protocol/{identity,group,proof}; self-hosted wasm/zkey, lazy-loaded
generateApprovalProof(identity, group, choice /*message*/, proposalId /*scope*/, depth=16): Promise<SemaphoreProof>
```

- Show a spinner (≈2–15s budget); load multi-MB artifacts only when the member is about to
  vote (research §4).

---

## 6. Honest-state UX (constitution III)

- P3 leaderboards: interim/off-chain standings are **visually marked non-final**, distinct
  from a settled on-chain outcome (FR-031).
- Pending resolution, join-closed, refund-eligible, and locked states are surfaced truthfully
  per the pool's on-chain `state`.
- All accessible per WCAG 2.1 AA; ESLint clean (constitution V).
