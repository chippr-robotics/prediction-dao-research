# Feature Specification: Network-Aware Swap Provider

**Feature Branch**: `033-network-aware-swap`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "the swap functionality needs to be network awary. on mordor and etc it should default to etcswap (etcswap.com v3 deployment of the uniswap platform. on all other networks it should default to the uniswap implementation"

## User Scenarios & Testing *(mandatory)*

The in-app Swap surface lets a connected user exchange the active network's native, wrapped-native, and stablecoin tokens. Today the swap **routes** through whatever DEX deployment is configured for the active chain, but every user-facing label, message, and external link names the provider "Uniswap V3" — even on Ethereum Classic, where the deployment is actually **ETCswap**. This feature makes the swap's *provider identity* network-aware so users always see, and are linked to, the correct DEX for the chain they are on.

### User Story 1 - Swap on Ethereum Classic shows and uses ETCswap (Priority: P1)

A member connected to an Ethereum Classic network (Mordor testnet today, and Ethereum Classic mainnet) opens Swap. The panel identifies the provider as **ETCswap**, routes the trade through the ETCswap deployment, and every supporting link (provider site, "swap router" reference) points at ETCswap / the Ethereum Classic block explorer — never at Uniswap.

**Why this priority**: This is the core of the request and the only network family currently mislabeled. ETC users are being shown a provider name and (potentially) links that don't match where their funds actually route, which is misleading and erodes trust on the app's value-bearing surface.

**Independent Test**: With the wallet on an ETC-family network that has ETCswap configured, open Swap and confirm the provider is named ETCswap, the external/provider link resolves to the ETCswap site, and a quote/swap executes against the ETCswap deployment. Delivers correct, honest provider identity on ETC with no Uniswap references.

**Acceptance Scenarios**:

1. **Given** the wallet is connected to Mordor (or ETC mainnet) with ETCswap configured, **When** the user opens the Swap panel, **Then** the panel identifies the active provider as "ETCswap" and shows no "Uniswap" wording.
2. **Given** the user is on an ETC-family network, **When** they follow the provider / DEX link from the swap panel, **Then** the link opens the ETCswap site (and contract/explorer links use the Ethereum Classic explorer for that chain).
3. **Given** the user is on an ETC-family network with ETCswap configured, **When** they request a quote and confirm a swap, **Then** the trade routes through the ETCswap deployment for that chain.

---

### User Story 2 - Swap on non-ETC networks shows and uses Uniswap (Priority: P2)

A member connected to a non-ETC network (Polygon mainnet, Polygon Amoy) opens Swap. The panel identifies the provider as **Uniswap**, routes through the Uniswap deployment, and supporting links point at Uniswap / that network's explorer.

**Why this priority**: This preserves correct behavior on the production default network and codifies the "everything else defaults to Uniswap" half of the rule, so the mapping is explicit rather than incidental. It is P2 because today's Polygon experience is already routing through Uniswap; the work is making the identity an explicit, data-driven default rather than a hardcoded assumption.

**Independent Test**: With the wallet on Polygon (or Amoy with Uniswap configured), open Swap and confirm the provider is named Uniswap, the provider link resolves to the Uniswap app, and a swap routes through the Uniswap deployment.

**Acceptance Scenarios**:

1. **Given** the wallet is connected to Polygon mainnet, **When** the user opens the Swap panel, **Then** the panel identifies the active provider as "Uniswap" and provider links resolve to the Uniswap app.
2. **Given** the wallet is connected to a non-ETC network with a configured DEX, **When** the user swaps, **Then** the trade routes through the Uniswap deployment for that chain.

---

### User Story 3 - Network switch re-targets the provider; unavailable DEX explained honestly (Priority: P3)

A member switches networks mid-session (e.g., Testnet/Mainnet toggle, or switching to/from an ETC network). The swap panel immediately re-targets the correct provider identity and links for the new network with no stale branding. When the active network has no configured DEX, the panel explains *which* provider applies to that network and how swaps become available, without implying the wrong provider.

**Why this priority**: Correct identity must survive runtime network changes and degrade honestly when a DEX is not configured. It is P3 because it builds on the per-network identity established in P1/P2; without those, there is nothing correct to re-target to.

**Independent Test**: Switch the active network back and forth across an ETC and a non-ETC network and confirm the provider name and links update each time with no leftover references; then switch to a network with no configured DEX and confirm the disabled-state message names the provider that *would* apply to that network.

**Acceptance Scenarios**:

1. **Given** the user is viewing Swap on an ETC network, **When** they switch to Polygon, **Then** the provider identity and all links update to Uniswap with no remaining ETCswap references (and vice versa), without a page reload.
2. **Given** the active network has no configured DEX deployment, **When** the user opens Swap, **Then** the panel is disabled and the explanation names the provider applicable to that network and how to enable swaps, without naming the wrong provider.
3. **Given** an ETC-family network is selected but ETCswap addresses are not configured, **When** the user opens Swap, **Then** the panel reports that ETCswap is not configured for that network (not "Uniswap on Polygon") and offers no mock provider.

---

### Edge Cases

- **Mislabel risk**: an ETC-family chain whose DEX addresses happen to be present must still show **ETCswap**, never the generic "Uniswap V3" wording the panel currently hardcodes.
- **Runtime switch**: switching the active network must clear the previous provider's name and links so no stale branding/links from the prior network remain.
- **DEX not configured**: when required addresses are missing, the swap is disabled with a provider-correct, network-specific message — no mock or placeholder DEX is ever presented (honest-state).
- **Unsupported / unknown chain**: with no provider mapping, the swap surface is hidden or disabled with a generic, non-misleading message.
- **Provider site vs explorer links**: provider/marketing links resolve to the active provider's canonical site; contract/transaction links resolve to the active network's block explorer — the two must not be conflated.
- **Provider name leakage**: provider identity is scoped to the active network and never carried over when data for another network is shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST determine the swap DEX provider from the active network: Ethereum Classic networks (ETC mainnet and Mordor testnet) MUST default to **ETCswap**; all other supported networks MUST default to **Uniswap**.
- **FR-002**: Every user-facing swap surface (headings, body copy, disabled-state messages, link labels) MUST name the active provider correctly and MUST NOT display a provider name that does not match the active network.
- **FR-003**: Provider / "open DEX" links presented in the swap surface MUST resolve to the active provider's canonical site (ETCswap for ETC-family networks; the Uniswap app for other networks).
- **FR-004**: Contract and transaction links in the swap surface MUST use the active network's block explorer and the active provider's deployed contract addresses for that network.
- **FR-005**: When the user changes the active network, provider identity, links, and routing MUST update automatically (no page reload) with no residual references to the previously active network's provider.
- **FR-006**: When the active network has no configured DEX deployment, the swap surface MUST be disabled and MUST display a message that names the provider applicable to that network and how swaps become available, without naming a provider from a different network.
- **FR-007**: The network-to-provider mapping MUST be data-driven (each supported network declares its DEX provider identity), so adding or adjusting a network requires configuration rather than special-case branching.
- **FR-008**: Because both providers are Uniswap-V3-compatible deployments, the quote, approval, and swap mechanics MUST remain identical across providers; only the provider identity, contract addresses, and links differ by network.
- **FR-009**: Provider identity MUST be scoped to the active network and MUST NOT leak across networks or across the testnet/mainnet boundary.
- **FR-010**: The system MUST continue to gate swap availability on configured DEX addresses (no mock/placeholder provider); an ETC-family network without ETCswap addresses presents as "ETCswap not configured," and a non-ETC network without Uniswap addresses presents as "Uniswap not configured."
- **FR-011**: The system MUST add Ethereum Classic mainnet (chainId 61) as a user-selectable network bound to **ETCswap**, so the "ETC → ETCswap" default is reachable by users. The network MUST supply ETCswap contract addresses, the ETC stablecoin and wrapped-native token, and the Ethereum Classic block explorer. Swap availability on ETC mainnet is gated on those addresses being configured (FR-010); adding the network MUST NOT require live v2 wager contracts on ETC (the swap depends only on the DEX deployment).

### Key Entities *(include if data involved)*

- **DEX Provider**: a named DEX deployment family the swap can route through. Attributes: display name (e.g., "ETCswap", "Uniswap"), canonical site URL, optional icon/branding. Both providers are Uniswap-V3-compatible.
- **Network DEX Binding**: the association of a supported network to exactly one DEX provider plus that network's deployed DEX contract addresses, stablecoin, and wrapped-native token. Drives which provider identity and which addresses the swap uses on that network.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every supported network that has a configured DEX, the swap surface shows the correct provider name 100% of the time — ETCswap on ETC-family networks, Uniswap on all others.
- **SC-002**: After switching the active network, provider identity and all provider/explorer links update within a single interaction (no reload), with zero references to the previously active network's provider.
- **SC-003**: Zero user-facing "Uniswap" references appear on any ETC-family network's swap surface, and zero "ETCswap" references appear on any non-ETC network's swap surface.
- **SC-004**: For 100% of supported networks, the provider link resolves to that network's correct provider site, and contract/transaction links resolve to that network's block explorer.
- **SC-005**: A new network can be given correct provider identity through configuration alone (no per-network code branches), verifiable by adding a test network and confirming its provider name and links without modifying swap logic.
- **SC-006**: When a network's DEX is unconfigured, 100% of disabled-state messages name the provider applicable to that network (and never a different network's provider).

## Assumptions

- Each supported network has **at most one** DEX provider deployed; ETCswap and Uniswap are not both available on the same chain, so "default" means "the provider used on that network" and there is no in-network provider switcher.
- ETCswap is a Uniswap-V3 deployment, so the existing V3 quote/approve/swap logic is reused unchanged; only provider identity, addresses, and links become network-aware.
- Swap availability remains gated on configured DEX addresses using the existing per-network configuration pattern; missing addresses disable swaps with an honest message and never substitute a mock provider (constitution: Honest State).
- This is a frontend-only change — no new backend, no new smart contracts — consistent with the project's fixed no-backend footprint.
- Ethereum Classic mainnet (chainId 61) is added by this feature (FR-011) alongside the existing Mordor testnet (chainId 63); both are ETC-family networks bound to ETCswap and follow the same address-gated configuration pattern (no mock deployment). ETC mainnet's wager surface remains legacy/read-only — only the swap surface is enabled there.
- The ETCswap canonical site is the value referenced in the network configuration (e.g., the existing `etcswap.org` / `etcswap.com` link); the exact host is a configuration value, not a behavioral requirement.
- Provider/branding wording is English UI copy only; no localization work is implied.

## Dependencies

- Existing per-network configuration that already supplies per-chain DEX addresses, stablecoin, wrapped-native token, and block-explorer base URL.
- Existing swap/quote/wrap context that reads the active chain at runtime and exposes a DEX-available flag.
- For ETC-family swaps to function, valid ETCswap contract addresses must be configured for the relevant chain (already the case for Mordor when its addresses are supplied).
