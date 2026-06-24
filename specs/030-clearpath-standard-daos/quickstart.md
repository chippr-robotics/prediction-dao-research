# Quickstart & Validation: ClearPath Standard DAOs & External DAO Connectors

End-to-end validation against real on-chain state (no mock data). Run on local
Hardhat (1337), Amoy (80002), or Mordor (63). On Mordor (no subgraph) lists fall
back to on-chain reads or disable truthfully. See `contracts/` + `data-model.md`.

## Prerequisites

- `npm install` (no new third-party dep — native governance is OZ 5.4.0 Governor,
  already installed). `npm run compile` succeeds.
- A funded deployer; the existing `SanctionsGuard`, `MembershipManager`, and a USDC
  token deployed/recorded for the target network (read, not redeployed).

## 1. Deploy (factory + beacons + external registry)

```bash
npm run deploy:clearpath -- --network <local|amoy|mordor>   # UUPS proxies + beacons via lib/upgradeable.js;
                                                            # wires SanctionsGuard + MembershipManager + USDC;
                                                            # configures DAO_MEMBER_ROLE tier; records proxies+impls
npm run check:storage-layout        # ClearPath contracts registered; passes (baseline)
npm run sync:frontend-contracts     # frontend picks up addresses/ABIs
```
**Expect**: `deployments/<network>.json` gains `clearPathDAOFactory`(+Impl),
`externalDAORegistry`(+Impl), and the Governor/Timelock/MembershipNFT beacon+impl refs.

## Validation — A–E

### A. Launch a native standard DAO (US1, P1)
1. As a member ≥ the required tier, `createDAO(name, purpose, MembershipNFT, 0, params)`
   → one `DAOCreated`; a deployed Governor + Timelock (USDC treasury) + soulbound
   membership NFT; the DAO in My DAOs.
2. Pick the token-voting option → the DAO uses an ERC20Votes token instead.
3. **Negative**: a sub-tier or sanctioned wallet → rejected before signing + on-chain.

### B. Discover, register & track an external DAO — Olympia (US2/US3, P1)
1. In Explorer → **Register external DAO**, paste Olympia's governor address on Mordor
   → validated (ERC-165 IGovernor) and added with framework=OZGovernor; appears in My
   DAOs / Explorer labeled "external".
2. Open it → its real treasury balance, proposals + vote tallies + states, and
   membership match Olympia's on-chain state. Registering an EOA / non-Governor →
   rejected with a truthful reason.
3. Switch networks → only the active network's DAOs show; unsupported network → tab
   disabled truthfully. Subgraph-less (Mordor) → on-chain reads / truthful "unavailable".

### C. Proposal lifecycle — native + external (US4/US5, P2)
1. Native: `propose` a USDC treasury disbursement → vote to quorum + success → `queue`
   → after the timelock `execute` → recipient funded on-chain, exactly once; a defeated
   proposal performs no action.
2. External (Olympia), as a wallet holding its membership NFT: `castVote` on an open
   proposal through ClearPath → the vote records on Olympia's own contract (user-signed);
   a wallet without authority → rejected by Olympia's rules, reason surfaced.
3. **Sanctions**: a ClearPath-mediated value move with a sanctioned actor/recipient →
   blocked. **Unsupported framework** → read-only + truthful deep-link, no broken action.

### D. Admin: roles, params, ownership (US6, P2)
1. Grant the proposer role to a second wallet → only it (and admins) can propose;
   revoke → blocked. Update params → applied to new proposals. Transfer/renounce
   ownership → authority moves; unauthorized callers rejected on-chain.

### E. Activity + contract surface + theme (US7/US8)
1. After actions, the activity feed shows created/registered/proposed/voted/executed
   events (subgraph) with actor/tx/time; Mordor → truthful disable.
2. Contract sub-tab shows real governor/timelock/token addresses + framework + explorer
   links; copy address/ABI work; external DAOs labeled "externally deployed".
3. Toggle dark mode → restyles via theme variables; axe passes.

## Invariants + gates

- **INV-1..5** (data-model.md): treasury moves only via executed proposals; no overdraw /
  single execution; sanctions non-bypassable on value moves; ClearPath holds no
  authority over external DAOs; network-scoped.

```bash
npm test                       # unit + integration for factory/governor/timelock/registry + upgrade lifecycle
npm run check:storage-layout   # append-only storage (gating)
npm run test:frontend          # Vitest for the ClearPath module (incl. axe)
cd subgraph && npm run codegen && npm run build   # + Matchstick via Docker
# CI additionally runs Slither (proxy/clone/AccessControl/Governor) + Medusa: no new high/critical
```

**Done when**: every A–E scenario passes against real on-chain state (incl. tracking a
real Olympia DAO + a user-signed external vote), treasury safety + sanctions hold, no
phantom/mock rows, subgraph-less fallback is truthful, and the suite + security gates
are green.
