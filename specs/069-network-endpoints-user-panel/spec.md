# Feature Specification: Network Settings in the User Panel & Member RPC Endpoints

**Feature Branch**: `claude/network-tab-user-panel-ih10ko`

**Created**: 2026-07-27

**Status**: Implemented

**Input**: User description: "as our app has evolved to become a multi-network control plane, the
network tab has outlived its usefulness in the tool section. it should be relocated to the user panel
alongside preferences. a user should be able to set their rpc, failover rpc and any api keys or
satisfy common security needs from rpc providers. services in the app should use these routes when
looking up information on or interacting with an asset. all assets carry their token and chain info so
it is only necessary to switch networks during the transaction sending. we wish to give as network
agnostic an experience as possible."

## Overview

The Network tab was designed when the app had one active chain: you went there to *change which
network you were on*. That premise no longer holds. Portfolio, Earn positions, staking, ClearPath,
custody and Collect all read every supported network at once; every asset carries its own `chainId`;
and the sending surfaces prompt for a wallet chain switch themselves at submit time. What is left of
"Network" is configuration — which endpoint each network's lookups take — so it belongs with the
member's other settings, not in Tools.

This feature does three things:

1. **Relocates network settings to the user panel**, beside Preferences on the account button. The
   tab id (`network`) and route (`/wallet?tab=network`) are unchanged, so every saved link keeps
   resolving.

2. **Gives the member their RPC route.** Per network: a primary RPC URL, an optional failover behind
   it, and the credential their provider expects (key in the URL, a custom header, or a bearer
   token). Every read in the app resolves through those settings; a member on a paid endpoint gets
   their whole app on it, not just the chain their wallet happens to be on.

3. **States the network-agnostic model honestly in the UI.** The panel says switching is only needed
   to *send* on a network the wallet is not currently on, rather than presenting the active chain as
   the thing that determines what the app can see.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find network settings where the other settings are (Priority: P1)

A member looking for network configuration opens the account button — the same place Account,
Membership and Preferences live — and finds Network beside Preferences. Tools no longer offers it, and
neither does the mobile bottom bar for any Tools section.

**Acceptance**

1. The account menu lists Network directly above Preferences and routes to `/wallet?tab=network`.
2. `network` appears in no nav group; `groupForTab('network')` is null (so no bottom bar claims it).
3. An existing `/wallet?tab=network` link still opens the panel.

### User Story 2 - Run a network on my own RPC endpoint (Priority: P1)

A member with an Alchemy key pastes it into Polygon's RPC URL, tests it, saves, and every Polygon
lookup in the app — portfolio balances, Earn positions, transfer balances, contract reads — goes
through their endpoint from then on.

**Acceptance**

1. Saving an endpoint changes the network's route from "App default" to "Your endpoint".
2. The route summary shows the endpoint redacted (protocol + host + `/…`), never the key.
3. Read providers built after the save use the member endpoint even when the caller passed the build
   default URL.
4. Networks the member has not configured stay on their defaults.

### User Story 3 - Survive a provider outage (Priority: P1)

The member adds a failover endpoint. When the primary rate-limits or goes down, reads continue.

**Acceptance**

1. A configured primary + failover yields a quorum-1 fallback provider, primary first.
2. With no explicit failover, the build default stands in behind the member's endpoint.
3. Wallet transports likewise fall back rather than dying with a single provider.

### User Story 4 - Satisfy a provider's security requirements (Priority: P2)

The member's provider expects `x-api-key` (or `Authorization: Bearer …`) rather than a key in the
path. They pick the auth mode, enter the key, and it is sent as a request header.

**Acceptance**

1. Header and bearer modes both produce the right request header.
2. The key field is masked by default with an explicit reveal.
3. The key is attached to the primary endpoint only.
4. The key is never written to a URL, never logged, and never included in a backup.

### User Story 5 - Be told the truth about an endpoint (Priority: P2)

The member pastes an endpoint that serves the wrong chain, or a host the app's content-security
policy blocks. The panel tells them which, before they rely on it.

**Acceptance**

1. "Test" reports the chain the endpoint actually serves.
2. An endpoint serving a different chain than the network being edited cannot be saved.
3. A local (loopback) endpoint saves with its real caveats stated: device-only, and the node must
   allow cross-origin requests from the app. A non-loopback `http://` endpoint is refused, because
   the browser would block it as mixed content whatever the app's policy says.
4. An unreachable endpoint reports the failure without echoing the credential.

### User Story 6 - Stop thinking about which network I am on (Priority: P2)

A member holding assets on four chains sees all of them, on any active chain, and is asked to switch
only when they send.

**Acceptance**

1. The panel frames switching as send-time-only rather than as a prerequisite for viewing.
2. Cross-chain reads continue to resolve per-asset `chainId` independent of the connected chain.
3. Bitcoin (spec 061) remains display-only: no wallet switch affordance.

### Edge Cases

- **Credential with no endpoint.** Saving auth settings without a primary URL is rejected, and no
  token is persisted — a stored secret with nothing to use it on is pure liability.
- **Failover identical to primary.** Rejected: it is not a failover.
- **WebSocket URL.** Rejected with a reason (the read providers are HTTP).
- **`http://`** rejected except on localhost (dev).
- **Credentials in URL userinfo** (`https://user:pass@host`) rejected, pointing at the key fields.
- **Garbage in storage** yields an empty override map rather than a crash.
- **Clearing the URL** removes the whole entry, including any stored token.
- **No wallet connected.** Endpoints still apply: they are device-scoped, because the app's busiest
  read paths run before any wallet is connected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Network settings MUST be reachable from the account button beside Preferences and MUST
  NOT appear in any nav group or section icon bar. The `network` tab id and `/wallet?tab=network`
  route MUST be unchanged.
- **FR-002**: A member MUST be able to set, per supported EVM network, a primary RPC URL, an optional
  failover RPC URL, and an optional API credential presented as a custom header or a bearer token.
- **FR-003**: Endpoint resolution MUST be `member override → build default (VITE_RPC_URL_* or curated
  public endpoint)`, with a single implementation both the ethers read paths and the wagmi wallet
  transports consume.
- **FR-004**: Every service that reads or writes asset/contract state MUST resolve its endpoint
  through that implementation. No code path may hand-build a provider from `NETWORKS[chainId].rpcUrl`
  in a way that bypasses the member's route.
- **FR-005**: A configured failover MUST produce real failover behavior (quorum-1 fallback, primary
  first) for reads and for wallet transports. With no explicit failover, the build default MUST stand
  in behind the member's endpoint.
- **FR-006**: A member credential MUST be transmitted as a request header, never embedded into a URL
  by the app, and MUST be attached to the primary endpoint only.
- **FR-007**: Endpoint URLs MUST be redacted (protocol + host, `/…` when a path/query exists) at every
  display and log boundary. No error path may echo an unredacted endpoint.
- **FR-008**: Endpoint settings MUST be device-scoped (usable with no wallet connected) and MUST NOT
  be included in the spec-032 backup.
- **FR-009**: The panel MUST offer a test that reports the chain an endpoint actually serves, MUST
  refuse to save an endpoint whose chain id contradicts the network being edited, and MUST report an
  unreachable endpoint honestly.
- **FR-010**: Validation MUST reject WebSocket URLs, non-localhost `http://`, URL-embedded
  credentials, a failover equal to the primary, auth settings without a primary URL, and a malformed
  header name; each rejection MUST state the reason.
- **FR-011**: A member MUST be able to use their own node — self-hosted on any https host, or running
  locally over loopback http. A non-loopback `http://` endpoint MUST be refused with the reason
  (browsers block it as mixed content) and the two options that do work. A local endpoint MUST
  disclose that it is device-only and requires CORS on the node.
- **FR-012**: The production CSP `connect-src` MUST grant `https:` scheme-wide plus the loopback http
  origins, since a per-member allowlist is not expressible in a static header. The grant MUST NOT
  extend to `script-src`, `frame-src` or `img-src`. What the policy admits MUST stay in sync with what
  the endpoint form validates (`CSP_RPC_GRANTS`), enforced by a test.
- **FR-013**: A saved endpoint MUST take effect for reads without a reload; where a reload is
  genuinely required (wallet transports, built once at module load), the UI MUST say so rather than
  implying an instant switch.
- **FR-014**: Resetting a network MUST return it to the build default and remove any stored
  credential for it, leaving other networks untouched.
- **FR-015**: The panel MUST continue to document each network (capabilities, currency, stablecoin,
  explorer, faucet, swap provider) and offer a wallet switch, while framing the switch as needed only
  when sending on a network the wallet is not currently on.

### Key Entities

- **EndpointEntry** — per chain: `url`, optional `failoverUrl`, optional `authMode`
  (`none` | `header` | `bearer`), `authHeaderName`, `authToken`. Persisted only with a `url`.
- **ResolvedRoute** — what a consumer gets: `primary { url, headers }`, `failover { url, headers }`,
  `source` (`member` | `default`), `defaultUrl`.
- **ProbeResult** — `ok`, `chainId`, `code` (`ok` | `unreachable` | `chain-mismatch` |
  `bad-response` | `invalid-url`), redacted `message`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can point any supported network at their own endpoint and every read for that
  network uses it, verified by provider-construction tests rather than by inspection.
- **SC-002**: No test, log line, or rendered string contains an endpoint credential.
- **SC-003**: Network is absent from Tools and present beside Preferences; existing deep links still
  resolve.
- **SC-004**: A wrong-chain endpoint cannot be saved; a CSP-blocked host is warned about before use.
- **SC-005**: `CSP_RPC_GRANTS` and the shipped nginx `connect-src` cannot drift without a failing
  test, and the broad grant cannot silently spread to other directives.
- **SC-006**: A member can point a network at `http://localhost:8545` or at their own https node and
  the app uses it.

## Assumptions

- Members configuring an endpoint are advanced users acting on their own provider account; the app's
  job is to route honestly and never leak, not to manage provider accounts.
- HTTP JSON-RPC only. WebSocket transports would need a separate provider path and are out of scope.
- The scheme-wide `connect-src` grant is an accepted trade: it is what makes bring-your-own-node
  possible, and it widens where data could be sent if a script were injected, not whether one can be.
- Bitcoin (spec 061) keeps its own network registry and gateway configuration; it is display-only in
  this panel.
- Per-endpoint credentials for the failover are out of scope; a keyed failover carries its key in its
  URL (which is how the major providers issue them anyway).
