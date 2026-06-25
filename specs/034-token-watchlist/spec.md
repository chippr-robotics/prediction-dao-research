# Feature Specification: Token Watchlist (My Tokens Assets)

**Feature Branch**: `034-token-watchlist`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "the token functionality needs to be extended with token registries from the uniswap exchanges so we are able to populate the users assets. we do not want to over burden the system so we will need the users to manually add the tokens they wish to watch and those should be tokens queried and displayed in the my tokens section. the sections should also support any additional custom tokens a user may want to add. this data should all be stored on the backup data of the user and client side. the tokens should be network aware so we do not show tokens from the wrong chain if a user has seected for a single network only."

## Clarifications

### Session 2026-06-25

- Q: How should the new watched-assets list coexist with the existing "My Tokens" tab that shows issued/administered tokens? → A: "My Tokens" becomes the watched-assets view (registry + custom tokens, with balances); the existing issued/administered tokens move to a clearly relabeled view (e.g., "Issued" or "Created").
- Q: Is using the watchlist gated by membership? → A: Require an active membership (any paid tier) to use the watchlist; a connected wallet without an active membership sees an honest gated state.
- Q: How are token logos handled given remote `logoURI` images and the hardened CSP? → A: Show logos only for registry tokens from an allowlisted trusted source; custom/unknown tokens always get a neutral placeholder (bounded CSP `img-src`; plain look flags unverified tokens).
- Q: Should custom/unverified tokens carry an explicit safety signal? → A: Show an inline "unverified — not in the token registry" badge on custom/unknown tokens; no blocking confirmation step.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a watchlist from the network's token registry (Priority: P1)

A member opens the "My Tokens" area while connected to a supported network and wants to track the tokens they care about. They browse or search a catalog of well-known tokens for that network (sourced from the Uniswap token registries), pick the ones they hold or want to watch, and add them. Each added token immediately appears in their personal "My Tokens" list showing the token's identity (symbol, name, logo) and the connected wallet's current balance. Only tokens belonging to the currently selected network are shown.

**Why this priority**: This is the core value — turning an empty or issuer-only screen into a usable, self-curated view of the user's on-chain assets without scanning the whole chain. It is the minimum viable slice: a user can curate and view their assets even if custom tokens and cross-device sync are not yet built.

**Independent Test**: Connect a wallet on a supported network, open My Tokens, search the registry for a known token (e.g., a major stablecoin), add it, and confirm it appears in the list with the correct symbol and the wallet's live balance — and that no tokens from other networks appear.

**Acceptance Scenarios**:

1. **Given** a connected wallet on a supported network with an available token registry, **When** the user searches the catalog and adds a token, **Then** that token appears in "My Tokens" with its symbol, name, logo (when available), and the wallet's current on-chain balance.
2. **Given** a watched token already in the list, **When** the user attempts to add the same token again on the same network, **Then** the system prevents a duplicate entry and indicates the token is already tracked.
3. **Given** a watchlist containing tokens added on Network A, **When** the user switches the active network to Network B, **Then** only Network B's watched tokens are shown and Network A's tokens are hidden (not deleted).
4. **Given** a connected member viewing their watchlist, **When** a token's balance cannot be read (e.g., a transient RPC failure), **Then** the token still appears with its balance marked unavailable rather than a misleading zero.
5. **Given** a wallet that is connected but has no active membership, **When** they open "My Tokens", **Then** they see an honest gated state explaining that an active membership is required, instead of the watchlist.

---

### User Story 2 - Add a custom token by contract address (Priority: P2)

A user holds or wants to watch a token that is not listed in the Uniswap registry for their network (a newly launched token, a niche asset, or a token they created). They paste the token's contract address into an "add custom token" input. The system resolves the token's identity directly from its on-chain contract and adds it to "My Tokens" for the active network, alongside registry-sourced tokens.

**Why this priority**: Registries never cover everything; custom additions make the watchlist complete and future-proof. It depends on the P1 list existing, so it follows P1.

**Independent Test**: On a supported network, paste a valid ERC-20 contract address that is not in the registry, confirm the resolved symbol/decimals are correct, and verify it appears in "My Tokens" with the correct balance.

**Acceptance Scenarios**:

1. **Given** a valid ERC-20 contract address not present in the registry, **When** the user adds it as a custom token, **Then** the system resolves its symbol, name, and decimals from the contract, adds it to the active network's watchlist, and displays it with an inline "unverified" indicator and a neutral placeholder logo.
2. **Given** an address that is not a valid token contract (or fails metadata resolution), **When** the user attempts to add it, **Then** the system rejects it with a clear, honest message and adds nothing.
3. **Given** a custom token address that matches a token already tracked on the active network, **When** the user adds it, **Then** the system prevents a duplicate.

---

### User Story 3 - Persist and restore the watchlist (encrypted backup + local) (Priority: P3)

A user has curated a watchlist across one or more networks. Their selections survive page reloads on the same device automatically, and are included in their encrypted backup so the watchlist can be restored on another device or after clearing local data — with each token reattached to the correct network. They can also remove tokens they no longer want to track.

**Why this priority**: Persistence and cross-device continuity protect the user's effort, but the feature delivers value within a single session before this is in place. It reuses the existing encrypted backup mechanism, so it is additive.

**Independent Test**: Add several tokens across two networks, trigger a backup, clear local data, restore from backup, and confirm every token reappears under the correct network with no losses or cross-chain mix-ups.

**Acceptance Scenarios**:

1. **Given** a curated watchlist, **When** the user reloads the page on the same device, **Then** the watchlist is intact without re-adding anything.
2. **Given** a watchlist that has been backed up, **When** the user restores their backup on a fresh device/session, **Then** all watched tokens are restored and each is associated with the network it was added on.
3. **Given** a watched token the user no longer wants, **When** they remove it, **Then** it disappears from "My Tokens" for that network and the removal is reflected in local storage and the next backup.

---

### Edge Cases

- **Same address on multiple networks**: A token address that exists on several chains is tracked as separate entries per network; balances and display reflect the active network only.
- **Lookalike / spoofed tokens**: Two tokens may share a symbol; identity is keyed by contract address (plus network), and the address is surfaced so users can distinguish a legitimate token from an impostor.
- **Registry unavailable**: If the token catalog for the active network cannot be loaded, the user can still add custom tokens and still sees their already-watched tokens, with an honest notice that the catalog is unavailable.
- **Network without a registry**: On a supported network that has no associated token list, browsing the catalog is unavailable but custom additions still work, with honest messaging.
- **No backup configured**: The watchlist still works and persists locally even if the user has never set up an encrypted backup; backup inclusion is opportunistic, not required.
- **Token with no logo**: The token displays with a neutral placeholder; absence of a logo never blocks adding or viewing. Custom and unknown tokens always use the placeholder (no remote logo is fetched for them), regardless of any logo their contract might advertise.
- **Balance read fails / wallet disconnected**: The token still appears; its balance shows as unavailable with an honest indicator rather than a misleading zero.
- **Large watchlist**: Because tokens are only ever added manually, list size stays bounded; the view remains responsive.
- **Backup merge conflict**: When the same wallet is used on two devices, restored and local watchlists merge so no manually added token is silently lost.
- **Connected but not a member**: A wallet that is connected but has no active membership sees an honest gated state explaining that an active membership is required, instead of the watchlist; no entries can be added or changed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to browse and search a per-network catalog of tokens sourced from the Uniswap token registries for the currently active network.
- **FR-002**: Users MUST be able to add a token from that catalog to their personal "My Tokens" watchlist.
- **FR-003**: Users MUST be able to add a custom token to their watchlist by entering its contract address, even when the token is not present in any registry.
- **FR-004**: System MUST resolve and display each watched token's identity (symbol, name, decimals, and logo when available); for custom tokens, symbol/name/decimals MUST be resolved from the token's on-chain contract.
- **FR-005**: System MUST display, for each watched token, the connected wallet's current on-chain balance, read live and never stored, and MUST clearly indicate when a balance cannot be shown (e.g., no wallet connected or read failure).
- **FR-006**: System MUST NOT automatically scan, discover, or import a user's token holdings; tokens appear in the watchlist only when the user explicitly adds them.
- **FR-007**: Every watchlist entry MUST be associated with a specific network; the same token address on different networks MUST be tracked as distinct entries.
- **FR-008**: The "My Tokens" view MUST show only watched tokens belonging to the currently selected network; tokens for other networks MUST NOT be shown while a single network is selected.
- **FR-009**: Users MUST be able to remove a token from their watchlist.
- **FR-010**: System MUST prevent duplicate entries (the same token address already tracked on the same network).
- **FR-011**: System MUST reject custom additions that are invalid or whose metadata cannot be resolved, with a clear, honest error, and MUST NOT add an unresolved token.
- **FR-012**: System MUST persist the watchlist client-side so it survives page reloads on the same device.
- **FR-013**: System MUST include the watchlist in the user's encrypted backup so it can be restored across sessions and devices, alongside the user's other backed-up data.
- **FR-014**: Watchlist data stored in the backup MUST be network-tagged so restored entries reattach to the correct network.
- **FR-015**: When restoring from a backup that overlaps an existing local watchlist, System MUST merge entries so no manually added token is lost.
- **FR-016**: When the registry for the active network is unavailable, System MUST still allow custom additions and continue to display already-watched tokens, with honest messaging about the catalog being unavailable.
- **FR-017**: System MUST continue to function on supported networks that have no associated token registry, supporting custom additions with honest messaging.
- **FR-018**: Token identity MUST be keyed by contract address (and network), not by symbol, and the address MUST be discoverable in the UI so users can distinguish legitimate tokens from lookalikes.
- **FR-019**: Viewing and managing the watchlist MUST be read-only with respect to assets — it MUST NOT initiate transfers or approvals (asset movement remains the responsibility of the separate Swap flow).
- **FR-020**: The feature MUST operate without any application backend — relying only on client-side logic, direct on-chain reads, public token registries fetched client-side, and the existing encrypted-backup/IPFS mechanism.
- **FR-021**: All new user interface MUST meet WCAG 2.1 AA accessibility requirements.
- **FR-022**: The "My Tokens" view MUST present the user's watched assets (registry-sourced and custom tokens, with balances); the existing issued/administered-tokens view MUST be retained under a clearly distinct label (e.g., "Issued" or "Created") so its capabilities are preserved and not removed or broken.
- **FR-023**: Use of the watchlist (viewing, adding, removing watched tokens) MUST require an active membership (any paid tier). A connected wallet without an active membership MUST see an honest gated state explaining the requirement rather than the watchlist, and MUST NOT be able to add or modify entries.
- **FR-024**: Token logos MUST be displayed only for registry-sourced tokens whose logo comes from an allowlisted trusted source; custom and otherwise-unknown tokens MUST always render a neutral placeholder. The system MUST NOT fetch arbitrary remote images, and the allowed image sources MUST stay within the application's Content-Security-Policy.
- **FR-025**: Custom and otherwise-unknown tokens (those not present in the active network's trusted registry) MUST display an inline "unverified" indicator (e.g., "not in the token registry") so users can distinguish them from curated tokens. Adding such a token MUST NOT require a separate blocking confirmation step.

### Key Entities *(include if feature involves data)*

- **Watchlist Entry**: A user's decision to track one token on one network. Attributes: contract address, network, resolved symbol/name/decimals, optional logo, source (registry vs. custom), and the time it was added. Network-tagged; persisted locally and in the encrypted backup.
- **Token Registry (Token List)**: A curated, per-network catalog of known tokens sourced from the Uniswap token registries, used as the menu from which users pick tokens. Read-only reference data, not user-owned.
- **Custom Token**: A watchlist entry added by raw contract address whose identity is resolved from the on-chain contract because it is absent from the registry.
- **Token Balance**: The connected wallet's current holding of a watched token, read live on demand for display only and never stored.
- **Watchlist (per wallet)**: The full collection of a user's watchlist entries across all networks, stored in the per-wallet encrypted backup bundle and filtered to the active network for display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can find a known token in the registry and add it to "My Tokens" — seeing its symbol and live balance — in under 1 minute and within a few search results.
- **SC-002**: A user can add a custom token knowing only its contract address in under 30 seconds, with correct symbol and decimals resolved.
- **SC-003**: After switching the active network, 100% of displayed watched tokens belong to the newly selected network (zero cross-chain leakage).
- **SC-004**: After clearing local data and restoring from backup, 100% of previously watched tokens are restored with their correct network associations and none are lost.
- **SC-005**: Zero tokens appear in "My Tokens" that the user did not explicitly add (no automatic discovery or import).
- **SC-006**: 100% of invalid custom addresses are rejected with an actionable message, and no unresolved or placeholder token is ever added.
- **SC-007**: The feature operates with no additional server or backend component beyond the existing client + on-chain + IPFS footprint.
- **SC-008**: When the registry is unavailable, users can still add a custom token and still see their existing watchlist 100% of the time, with a clear notice of the catalog's unavailability.

## Assumptions

- **Placement**: The "My Tokens" view is the user's watched-assets list (registry-sourced + custom tokens, with balances). The pre-existing issued/administered-tokens view is retained under a clearly distinct label (e.g., "Issued" or "Created"); issuing/administration functionality is preserved, only relabeled.
- **"Populate the users assets" means balances**: Showing assets entails displaying the connected wallet's live balance for each watched token; balances are read on demand and never persisted.
- **Registry source**: Token catalogs are drawn from publicly available Uniswap token registries (the standard token-list format) fetched directly by the client per network, with a sensible default list per supported network. No application backend hosts or proxies these lists.
- **Read-only watching needs no compliance screening**: Adding a token to a watchlist is a display-only action and does not require the sanctions/compliance checks that apply to token creation or transfers; the separate Swap flow retains its own safeguards.
- **Backup mechanism reuse**: The per-wallet encrypted backup bundle and its network-tagging mechanism already exist; the watchlist plugs in as one additional backed-up domain rather than a new storage system.
- **Single active network model**: The application operates one selected network at a time. "A single network selected" refers to the active network; entries for other networks are retained but hidden. If a combined multi-network view is later introduced, entries group by network.
- **Supported networks**: Networks include the project's currently supported chains; registries are available where compatible Uniswap token lists exist, and networks without a list rely on custom additions.
- **Wallet connection & membership**: Using the watchlist requires a connected wallet with an active membership (any paid tier); membership is reused from the existing platform mechanism rather than a new access system. Within that gated view, the wallet's balances are read live for display.
- **Out of scope for this feature**: Automatic holdings discovery/scanning; fiat/price valuation of holdings; portfolio analytics or performance history; initiating swaps or transfers from the watchlist (Swap remains a separate flow). These may be considered in later features.
