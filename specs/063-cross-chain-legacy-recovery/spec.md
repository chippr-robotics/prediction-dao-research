# Feature Specification: Universal Acting-Account + Cross-Chain Legacy Recovery

**Feature Branch**: `063-cross-chain-legacy-recovery`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Universal acting-account + cross-chain legacy recovery. Wire the selected 'acting as' account into every surface (portfolio, home actions, receive, request), and derive cross-chain keys (Bitcoin full hardware-wallet scan, Solana, Zcash, Monero) from a recovered legacy BIP-39 seed so members can see and move funds those seeds control."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The selected account is the account, everywhere (Priority: P1)

A member has more than one account available in the app — their personal wallet, a multisig vault, and/or a recovered legacy account. They pick one to "act as" from the global switcher (or a per-screen selector). From that moment, every money-and-identity surface reflects that account: the portfolio lists that account's holdings, the Receive screen shows that account's address and QR, a payment Request is addressed to that account, the Home quick actions send from and receive to that account, and the account/dashboard figures describe that account. Switching back to the personal wallet returns every surface to normal.

**Why this priority**: It is the enabling, highest-safety slice and is independently valuable even without any new chains. Today only Transfer and Trade honor the selection, so a member can view one account's balances while unknowingly receiving to — or sending from — another. That inconsistency is a direct route to lost funds and eroded trust, and it must be closed before more account types (derived non-EVM accounts) are added.

**Independent Test**: With a vault or recovered account selected, verify the portfolio, Receive address/QR, payment Request recipient, Home actions, and dashboard stats all resolve to the selected account; switching to personal resets them all. Fully testable with the existing account types, no new-chain work required.

**Acceptance Scenarios**:

1. **Given** a member acting as their personal wallet, **When** they select a vault (or recovered account) as the acting account, **Then** the portfolio holdings, Receive address/QR, payment Request recipient, Home send/receive actions, and dashboard stats all update to that account within the same view, with no reload.
2. **Given** a member acting as account X, **When** they open Receive, **Then** the address and QR shown are X's address (and, for a chain X cannot use, the surface honestly indicates the account has no address on that chain rather than showing another account's address).
3. **Given** a member acting as account X, **When** they create a payment Request, **Then** the request is addressed to X, and the confirmation restates which account will receive.
4. **Given** a member acting as a recovered/vault account, **When** they switch back to the personal wallet, **Then** every surface returns to the personal wallet's holdings, address, and stats.
5. **Given** a member acting as an account that cannot transact on the currently selected network, **When** they view a send/trade action, **Then** the app clearly discloses this (mirroring the existing wrong-network guard) instead of silently acting as a different account.

---

### User Story 2 - Recover Bitcoin funds a legacy seed actually holds (Priority: P2)

A member recovers a legacy account from a BIP-39 word list that was previously used with a hardware wallet or an older Bitcoin wallet. The app derives the Bitcoin addresses that seed controls across the derivation schemes real wallets use — legacy (addresses starting `1`), wrapped-segwit (`3`), native segwit (`bc1q`), and taproot (`bc1p`) — across more than just the first account, discovering used addresses with gap-limit scanning. Any Bitcoin balance it finds appears in the portfolio as a derived account the member can select and send from.

**Why this priority**: Bitcoin is the dominant asset held on hardware and older wallets, and recovering only the default Ethereum address silently strands it. It reuses the app's existing Bitcoin address/UTXO/send machinery, so it is the highest-value cross-chain slice for the least new surface. It depends on US1 so the recovered Bitcoin account can be acted-as consistently.

**Independent Test**: Import a known test mnemonic with Bitcoin history on non-default paths/accounts; verify the app discovers the funded addresses across BIP44/49/84/86 and multiple accounts, shows the correct total balance in the portfolio, and can build and broadcast a valid send from the recovered account. Testable against well-known BIP test vectors and testnet funds.

**Acceptance Scenarios**:

1. **Given** a recovered mnemonic with Bitcoin received on a BIP44 legacy address in account 0, **When** discovery runs, **Then** that address and its balance are found and included in the account's Bitcoin total.
2. **Given** a recovered mnemonic with funds on account index 1 (not only account 0), **When** discovery runs, **Then** the funded account is found via account-level scanning and its balance is included.
3. **Given** a discovered Bitcoin balance, **When** the member selects the recovered account and sends Bitcoin, **Then** the app builds a valid transaction from the recovered UTXOs, discloses that the member pays the network fee, and broadcasts it, with the send-time fee treated as a hard ceiling.
4. **Given** a mnemonic with no Bitcoin history, **When** discovery runs, **Then** the app reports no Bitcoin funds found (no phantom rows) after scanning to the gap limit.
5. **Given** a recovered raw private key (not a mnemonic), **When** the member views Bitcoin, **Then** the app offers at most the single Bitcoin address that key controls and clearly states a raw key cannot be scanned for other addresses.

---

### User Story 3 - Recover Solana funds from a legacy seed (Priority: P3)

A member's recovered BIP-39 seed also controls Solana funds (common with hardware wallets). The app derives the Solana account(s) that seed controls, shows any SOL balance in the portfolio as a selectable derived account, and lets the member send SOL from it.

**Why this priority**: Solana is a common secondary holding on hardware wallets, but it is a net-new client-side wallet in the app (no Solana wallet exists today), so it lands after Bitcoin. Depends on US1.

**Independent Test**: Import a known test seed with Solana activity; verify the derived Solana address matches the standard hardware-wallet derivation, the SOL balance is shown, and a native SOL transfer can be constructed and submitted.

**Acceptance Scenarios**:

1. **Given** a recovered mnemonic that controls a funded Solana account, **When** discovery runs, **Then** the Solana address is derived using the standard scheme hardware wallets use and its SOL balance appears in the portfolio.
2. **Given** a discovered SOL balance, **When** the member sends SOL from the recovered account, **Then** the app builds and submits a valid transfer and honestly discloses who pays the network fee.
3. **Given** a mnemonic with no Solana activity, **When** discovery runs, **Then** no Solana row is shown.

---

### User Story 4 - Recover Zcash (transparent) funds from a legacy seed (Priority: P4)

A member's recovered seed controls Zcash held on transparent addresses. The app derives those addresses, shows the balance in the portfolio, and lets the member send from them, mirroring the Bitcoin UTXO flow.

**Why this priority**: Zcash transparent addresses behave like Bitcoin UTXOs and reuse much of the Bitcoin flow, but Zcash is a less common holding, so it follows Solana. Depends on US1.

**Independent Test**: Import a seed with transparent Zcash funds; verify the transparent addresses are derived, the balance appears, and a transparent send can be built and broadcast.

**Acceptance Scenarios**:

1. **Given** a recovered mnemonic with transparent Zcash funds, **When** discovery runs, **Then** the funded transparent addresses and balance are found and shown.
2. **Given** a discovered transparent Zcash balance, **When** the member sends, **Then** a valid transparent transaction is built and broadcast with honest fee disclosure.
3. **Given** shielded (private) Zcash funds only, **When** discovery runs, **Then** the app honestly discloses that shielded balances are not recovered in this version rather than implying the seed is empty.

---

### User Story 5 - Recover Monero funds from a legacy seed (Priority: P5)

A member's recovered seed controls Monero. The app derives the Monero account, shows its balance, and lets the member send, disclosing Monero's inherent privacy and fee characteristics.

**Why this priority**: Monero is the most architecturally distinct (its own key model and private-by-default scanning), the least common holding, and the heaviest new surface, so it lands last. Depends on US1.

**Independent Test**: Import a seed that maps to a funded Monero account; verify the primary address is derived, the balance is discovered through the supported scanning path, and a send can be constructed and submitted.

**Acceptance Scenarios**:

1. **Given** a recovered seed that maps to a funded Monero account, **When** discovery runs, **Then** the Monero primary address is derived and its balance is shown.
2. **Given** a discovered Monero balance, **When** the member sends, **Then** a valid transaction is constructed and submitted with honest disclosure that the member pays the network fee.
3. **Given** a seed with no Monero activity, **When** discovery runs, **Then** no Monero row is shown.

---

### Edge Cases

- **Account with no address on a chain**: When acting as an account that has no address on a given chain (e.g., a multisig vault has no Bitcoin address), Receive/Send for that chain must disclose "no address for this account on this chain," never fall back to another account's address.
- **Raw private key vs mnemonic**: A recovered raw private key is not a derivable tree. It controls the same single address on every EVM chain and at most one Bitcoin address; it cannot be scanned for other accounts/paths, and the UI must say so. Only a recovered mnemonic gets multi-chain, multi-path, multi-account derivation.
- **Discovery finds nothing**: After scanning to the gap limit across schemes/accounts, a chain with no history shows no row and a clear "no funds found on this chain" state — never a phantom zero-balance account that looks like a loss.
- **Discovery partially fails**: If a balance source for one chain is unreachable, other chains still resolve; the failed chain is shown in a degraded/unknown state, never as zero.
- **Large wallets**: A seed with many funded accounts/addresses must still complete discovery in bounded time and communicate progress rather than appearing frozen.
- **Locked/relocked account**: If the recovered secret is locked (biometric/passphrase) again mid-session, any derived keys are dropped from memory and the member is prompted to unlock before sending; balances already displayed may remain visible as read-only.
- **Network/testnet scoping**: Derived accounts and balances must respect the app's testnet/mainnet mode and never mix testnet and mainnet funds in one figure.
- **Send fee ceiling**: For every chain, the fee the member confirms is a hard ceiling; if the actual required fee would exceed it at signing time, the send is refused rather than silently over-charging.
- **Duplicate/known addresses**: A derived address that is also the member's existing FairWins-native address (e.g., a Bitcoin address the passkey wallet already issued) must be attributed to a single account, not double-counted.
- **Switching acting account mid-action**: Changing the acting account while a send/request form is open must re-target or clearly reset the form, never submit against the previously selected account.

## Requirements *(mandatory)*

### Functional Requirements

#### Part A — Universal acting-account

- **FR-001**: The app MUST expose a single "acting account" selection that is honored by every money-and-identity surface: portfolio/holdings, Home quick actions (Send, Receive, Trade, Request), Receive address/QR, payment Requests, and account/dashboard statistics.
- **FR-002**: When an acting account is selected, the portfolio MUST show that account's holdings (its balances on the chains it can hold), not the connected wallet's.
- **FR-003**: When an acting account is selected, the Receive surface MUST present that account's receiving address and QR for the chosen chain, or honestly disclose that the account has no address on that chain.
- **FR-004**: When an acting account is selected, a payment Request MUST be addressed to that account, and the confirmation MUST restate which account will receive.
- **FR-005**: Home quick actions and dashboard statistics MUST reflect the acting account (its send/receive source and its figures).
- **FR-006**: Selecting the personal wallet MUST return every surface to the personal wallet's holdings, address, and statistics.
- **FR-007**: No surface may show one account's balances/identity while acting as another; when an acting account cannot transact on the current network, the app MUST disclose this rather than silently substitute a different account.
- **FR-008**: Switching the acting account MUST update dependent surfaces without requiring a reload, and MUST re-target or reset any open send/request form rather than submitting against the prior account.

#### Part B — Cross-chain derivation & recovery

- **FR-009**: When a member recovers a legacy account from a BIP-39 word list, the app MUST be able to derive keys and addresses for additional chains that seed can control — Bitcoin, Solana, Zcash, and Monero — in addition to the default Ethereum/EVM address.
- **FR-010**: Bitcoin discovery MUST cover the common derivation schemes real wallets use — legacy (P2PKH `1…`), wrapped-segwit (P2SH `3…`), native segwit (`bc1q…`), and taproot (`bc1p…`) — across multiple account indices (not only account 0), using gap-limit scanning to find previously used addresses.
- **FR-011**: The app MUST surface each chain's discovered balance in the portfolio as a derived account, and each derived account MUST be selectable as an acting account (Part A) so its funds can be viewed and moved.
- **FR-012**: For each supported chain, the member MUST be able to send discovered funds from the derived account, with honest disclosure of who pays the network fee and the confirmed fee treated as a hard ceiling.
- **FR-013**: A recovered raw private key (no seed) MUST reuse across all EVM chains and MAY yield a single Bitcoin address, but MUST NOT be presented as scannable for additional accounts/paths; the UI MUST state this limitation.
- **FR-014**: Discovery MUST distinguish "no funds found after scanning" from "could not check"; it MUST NOT display phantom zero-balance accounts and MUST NOT show a reachable-source empty result as an error, nor an unreachable source as zero.
- **FR-015**: Derivation and discovery MUST respect the app's testnet/mainnet mode and never combine testnet and mainnet balances.
- **FR-016**: For chains where only a subset of holdings is recoverable in this version (e.g., transparent-only Zcash), the app MUST disclose the limitation rather than implying the seed holds nothing on that chain.

#### Security & correctness (carried constraints, non-negotiable)

- **FR-017**: Recovered secrets and every derived seed/private key MUST be handled in memory only — never persisted in the clear, transmitted off-device, or written to logs or the activity ledger. Only encrypted ciphertext of the original secret is stored.
- **FR-018**: All derived key material MUST be dropped from memory when the account is locked/relocked, on account switch, and on disconnect, mirroring the existing recovered-signer lifecycle.
- **FR-019**: The existing FairWins passkey-derived Bitcoin derivation path and its wallet-breaking constants MUST remain unchanged; legacy/external derivation MUST be additive (a separate seed entry point) and MUST NOT alter the frozen path.
- **FR-020**: Bitcoin stamp/UTXO handling MUST remain fail-safe: a UTXO is spendable only when positively verified spendable; degraded verification MUST protect (never spend) the UTXO.
- **FR-021**: Any external data source used for balance discovery or broadcast MUST only ever receive bare public addresses and already-signed transactions — never seeds, private keys, or extended private keys.
- **FR-022**: Recovery and cross-chain discovery MUST be auditable without leaking key material: audit records may reference an account/chain/time but MUST NEVER contain seeds, keys, or full mnemonics.
- **FR-023**: Every new user-facing surface MUST meet the project's accessibility bar (WCAG 2.1 AA) and honest-state requirements (no implied finality the chain has not reached).

### Key Entities *(include if feature involves data)*

- **Acting Account (active identity)**: The single account the app currently acts as. Attributes: type (personal | vault | recovered-legacy | derived-external), display label, the address(es) it controls per chain, the set of chains/networks it can transact on, and whether it can currently sign (unlocked) on the active network.
- **Recovered Legacy Secret**: The imported secret behind a recovered account. Attributes: kind (mnemonic — re-derivable; or raw private key — single key), encrypted-at-rest ciphertext, protection method (biometric/passphrase). The cleartext exists only transiently in memory.
- **Derived External Account**: A per-chain account derived from a recovered mnemonic. Attributes: chain (Bitcoin/Solana/Zcash/Monero), derivation scheme and account index (where applicable), discovered address(es), and balance. Keys are memory-only.
- **Chain Discovery Result**: The outcome of scanning a seed against a chain. Attributes: chain, list of used/funded addresses and their balances, scan completeness (scanned-to-gap-limit vs. source-unreachable), and any disclosed limitation (e.g., transparent-only).
- **Send Request (per chain)**: A pending outbound transfer from a derived/acting account. Attributes: source account, destination, amount, quoted fee (ceiling), and payer-of-fee disclosure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With any non-personal account selected, 100% of the money-and-identity surfaces (portfolio, Receive, Request, Home actions, dashboard stats) show that account — verified by an automated check across every surface for each account type.
- **SC-002**: A member never receives to, or sends from, an account other than the one displayed as active: zero mismatches between the displayed acting account and the address used by Receive/Request/Send across the test matrix.
- **SC-003**: For a seed with Bitcoin funds placed on non-default paths/accounts, the app discovers and totals the funds across BIP44/49/84/86 and at least the first several account indices, matching a known-good reference wallet's total.
- **SC-004**: For each supported chain (Bitcoin, Solana, Zcash-transparent, Monero), a member can go from "recovered seed" to a broadcast send of discovered funds, with the network-fee payer disclosed before signing.
- **SC-005**: Across the full test matrix, no seed, private key, or extended private key ever appears in storage, network payloads, logs, or the activity ledger (verified by inspection/automated scanning of those sinks).
- **SC-006**: Discovery of a seed with no activity on a chain produces a clear "no funds found" result (not an error, not a phantom account) 100% of the time when the balance source is reachable.
- **SC-007**: The existing passkey-derived Bitcoin wallet is byte-for-byte unchanged — the frozen derivation test vectors still pass with no modification.
- **SC-008**: Discovery for a typical multi-account seed completes and communicates progress within a bounded, disclosed time window, and a slow/unreachable single chain never blocks the others.

## Assumptions

- **Acting-account model reuse**: Part A extends the existing shared "acting account" seam already consumed by Transfer and Trade; no new selection concept is introduced — the same selection simply reaches more surfaces.
- **Mnemonic vs. raw key**: Full cross-chain, multi-path, multi-account derivation applies only to recovered BIP-39 mnemonics. A recovered raw private key is treated as a single-key EVM account plus at most one Bitcoin address.
- **Bitcoin scope**: "Full hardware-wallet scan" means BIP44/BIP49/BIP84/BIP86 across a bounded range of account indices with gap-limit address scanning per account. Change-address chains are included in balance/spend accounting as needed for correctness.
- **Zcash scope (this version)**: Transparent addresses only. Shielded (private) balances are explicitly out of scope for this version and are disclosed as such rather than implied empty.
- **Solana scope (this version)**: Native SOL discovery and send. SPL token discovery/send is a candidate for a later version unless trivially included.
- **Monero scope (this version)**: Primary account balance discovery and native send via a supported scanning/broadcast path. Monero's distinct key model and private-by-default scanning are accepted as the heaviest new surface and are the lowest priority (P5); the feature may ship US1–US4 first and land US5 subsequently.
- **Balance/UTXO/broadcast data**: Discovering balances, fetching UTXOs, and broadcasting transactions for non-EVM chains rely on external data sources (indexers/explorers/gateways). These are treated as untrusted for confidentiality: they receive only public addresses and signed transactions. The specific providers are a planning/implementation decision, not part of this spec.
- **No smart-contract changes**: This is a client-side feature. No `contracts/` changes are expected; escrow/registry contracts are not involved.
- **Testnet support**: Each chain's testnet is used for automated/integration testing where a public testnet + faucet exists; mainnet/testnet balances are never combined.
- **Reuse of existing Bitcoin machinery**: Bitcoin address encoding, UTXO/stamp handling, coin selection, PSBT signing, and send/broadcast are reused from the existing Bitcoin feature; only an additive, HKDF-free seed entry point plus legacy-purpose (BIP44/49) encoders and account-level scanning are new.
