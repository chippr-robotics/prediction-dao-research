# Phase 1 Contracts: Cypress setup-helper interface + per-spec assertion contracts

For a test feature, the "interface" is the set of shared Cypress commands the specs
depend on, plus the assertion contract each spec must satisfy.

## New / extended shared commands (`frontend/cypress/support/commands.js`)

Setup commands send transactions to the local Hardhat node (chain 1337) with a
deterministic, public Hardhat test key (test-only) via `cy.task` defined in
`cypress.config.js`. Addresses are read from the synced `HARDHAT_CONTRACTS`.

```text
cy.setProtocolPaused(paused: boolean)
  // WagerRegistry.pause()/unpause() as the Guardian (#0). Idempotent.

cy.setAccountFrozen(address: string, frozen: boolean)
  // WagerRegistry.freezeAccount(address, reason)/unfreezeAccount(address) as Moderator (#0).

cy.grantMembershipFor(address: string, { tier?, durationDays? })
  // MembershipManager.grantMembership(address, WAGER_PARTICIPANT_ROLE, tier, durationDays).
  // durationDays small (or advanceTime afterward) to produce an expired membership.

cy.resolveMockCondition(conditionId: string, payouts: [number, number])
  // MockPolymarketCTF.resolveCondition(conditionId, payouts). [1,0]=YES, [0,1]=NO, [1,1]=tie.

cy.lastWagerId() -> Chainable<number>
  // Reads WagerRegistry.nextWagerId()-1 (or parses the WagerCreated event) to identify the
  // wager a test just created, for status/winner assertions.
```

Reused as-is: `mockWeb3Provider`, `connectWallet`, `switchAccount`, `openCreateWagerModal`,
`fillWagerForm`, `openMyWagers`, `advanceTime`, `assertToast`, `checkA11y`.

**Cleanup contract**: any spec that calls `setProtocolPaused(true)` or `setAccountFrozen(addr, true)`
MUST revert it in `afterEach` so the shared node is left clean for other specs.

## Per-spec assertion contract (what "implemented" means)

Each target spec MUST, for every acceptance scenario in spec.md, contain at least one
assertion that fails if the user-visible outcome is wrong. A `cy.get('body').should('be.visible')`
as the only assertion does NOT satisfy the contract (Constitution IV / FR-008).

- **19-paused-protocol**: assert create CTA disabled/blocked + paused message while paused; accept blocked; an existing active wager still resolves + claims; create works after unpause.
- **18-frozen-accounts**: assert create/accept/claim blocked with frozen messaging for a frozen account; all succeed after unfreeze.
- **11-refund-timeout**: assert creator balance/credit increases and wager shows Refunded after accept-timeout; both parties refunded after resolve-timeout; refund blocked before deadline.
- **08-oracle-resolution**: assert the correct winner is shown and claimable for YES/NO; a `[1,1]` tie does not pick a winner and refunds both after the deadline; any unwired oracle path is explicitly `.skip`ped with a reason (no silent gap).
- **20-expired-membership**: assert create is blocked with a renewal prompt for an expired membership; succeeds after renewal.
- **15-admin-panel**: assert the four control groups render for an admin and the withdrawal recipient defaults to the treasury; assert controls are hidden/denied for a non-admin.

## Out of scope (explicit)

- No changes to production contracts, the wallet-mock model, or the substantive (already-passing) specs except shared-helper extraction.
- No conversion of the suite to a public chain.
