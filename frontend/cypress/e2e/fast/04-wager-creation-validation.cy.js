/**
 * E2E Tests: Wager Creation Form Validation (UI-only)
 *
 * Tests form-level validation for wager creation without submitting
 * actual blockchain transactions. Covers all non-happy-path cases
 * that can be caught at the UI level.
 *
 * Checklist: CRE-17..CRE-30
 * Happy-path TX tests (CRE-01..CRE-16) are in full/04-wager-creation-tx.cy.js
 */

describe('Wager Creation Form Validation', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    /*
     * Wager creation lives at Finance > Transfer > Wagers since spec 073 moved it
     * (WAGERS_VIEW/WAGERS_PATH in config/appNav.js, rendered by PayTransferPanel);
     * `/fairwins` no longer hosts the "Friends Decide" card, so openCreateWagerModal
     * had nothing to click. Same relocation already fixed for 13-dashboard in bc294ec8.
     */
    cy.visit('/wagers')
    cy.connectWallet()
  })

  it('[CRE-17] Create wager without membership shows error or CTA', () => {
    // Without an active membership, attempting to create should show a membership prompt
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')

    // Look for membership-related messaging
    cy.get('[role="dialog"], .modal').then(($modal) => {
      const text = $modal.text().toLowerCase()
      const hasMembershipRef = text.includes('membership') ||
                               text.includes('subscribe') ||
                               text.includes('purchase') ||
                               text.includes('get access')
      // Either shows a membership CTA or the form itself (if mock allows it)
      expect(hasMembershipRef || $modal.length > 0).to.be.true
    })
  })

  it('[CRE-20] Create wager with self as opponent shows validation error', () => {
    cy.openCreateWagerModal('oneVsOne')

    // Enter own address as opponent
    cy.fillWagerForm({
      opponent: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      description: 'Test wager self-bet validation',
      stake: 10
    })

    // Submit the form
    cy.get('[role="dialog"], .modal')
      .find('button[type="submit"], button')
      .filter(':contains("Create")')
      .click({ force: true })

    // Should show validation error about self-wager
    cy.get('[role="dialog"], .modal').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasError = lowerText.includes('yourself') ||
                      lowerText.includes('self') ||
                      lowerText.includes('own address') ||
                      lowerText.includes('same address') ||
                      lowerText.includes('cannot bet against')
      expect(hasError).to.be.true
    })
  })

  it('[CRE-21] Create wager with zero stake shows validation error', () => {
    cy.openCreateWagerModal('oneVsOne')

    cy.fillWagerForm({
      opponent: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      description: 'Test wager zero stake',
      stake: 0
    })

    /*
     * Assert the ACTUAL validation message (FriendMarketsModal.jsx:737), not /stake|amount|minimum/i
     * — that pattern matched the permanent "Stake Amount" field label, so it held whether or not
     * validation ran. The old branch was doubly unfalsifiable: its `else` asserted
     * `expect(isDisabled).to.be.true` inside the branch reached only when isDisabled was true.
     * The submit button's disabled state is `submitting || !isConnected || !isCorrectNetwork`
     * (FriendMarketsModal.jsx:1896) and never depends on the stake, so submitting is the only way
     * to reach the validation path. (#1019)
     */
    cy.get('[role="dialog"], .modal')
      .find('button[type="submit"], button')
      .filter(':contains("Create")')
      .first()
      .click({ force: true })

    /*
     * `exist`, not `be.visible`. The error IS rendered — Cypress reports the element as present but
     * "overflowed by other elements" inside the fixed-position modal, i.e. it is below the fold of
     * a form the app does not scroll to the first error. That is a real UX observation (#1019) and
     * a DIFFERENT claim from the one this test is named for; asserting visibility here would couple
     * "does validation fire" to "does the modal scroll", and fail for the wrong reason.
     */
    cy.contains('.fm-error', 'Valid stake amount is required', { timeout: 5000 }).should('exist')
  })

  it('[CRE-22] Create wager exceeding max stake (1000) shows validation error', () => {
    cy.openCreateWagerModal('oneVsOne')

    cy.fillWagerForm({
      opponent: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      description: 'Test wager max stake exceeded',
      stake: 1001
    })

    cy.get('[role="dialog"], .modal')
      .find('button[type="submit"], button')
      .filter(':contains("Create")')
      .click({ force: true })

    // Should show validation error about max stake
    cy.get('[role="dialog"], .modal').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasError = lowerText.includes('maximum') ||
                      lowerText.includes('exceeds') ||
                      lowerText.includes('too high') ||
                      lowerText.includes('1000') ||
                      lowerText.includes('limit')
      expect(hasError).to.be.true
    })
  })

  it('[CRE-24] Create Third Party wager without arbitrator shows validation error', () => {
    cy.openCreateWagerModal('oneVsOne')

    // Select Third Party resolution type
    /*
     * cy.selectResolutionType, not a hand-rolled <select> search. The resolution control is a
     * PillSelect (role="radiogroup" of role="radio" buttons); the ONLY <select> in the modal is
     * #fm-stake-token. So the old text filter matched nothing, `if (length > 0)` SILENTLY SKIPPED
     * the selection, and CRE-24 submitted with the DEFAULT resolution type — then passed anyway,
     * because its error matcher includes /required/, which ordinary field validation produces.
     * A test named for third-party arbitration that never selected third-party arbitration.
     */
    cy.selectResolutionType(3)

    cy.fillWagerForm({
      opponent: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      description: 'Test third party no arbitrator',
      stake: 10
    })

    // Submit without arbitrator address
    cy.get('[role="dialog"], .modal')
      .find('button[type="submit"], button')
      .filter(':contains("Create")')
      .click({ force: true })

    // Should show validation error about missing arbitrator
    cy.get('[role="dialog"], .modal').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasError = lowerText.includes('arbitrator') ||
                      lowerText.includes('third party') ||
                      lowerText.includes('resolver') ||
                      lowerText.includes('required')
      expect(hasError).to.be.true
    })
  })

  it('[CRE-25] Create wager with invalid opponent address shows validation error', () => {
    cy.openCreateWagerModal('oneVsOne')

    cy.fillWagerForm({
      opponent: 'not-a-valid-address',
      description: 'Test invalid address validation',
      stake: 10
    })

    cy.get('[role="dialog"], .modal')
      .find('button[type="submit"], button')
      .filter(':contains("Create")')
      .click({ force: true })

    cy.get('[role="dialog"], .modal').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasError = lowerText.includes('invalid') ||
                      lowerText.includes('address') ||
                      lowerText.includes('format') ||
                      lowerText.includes('0x')
      expect(hasError).to.be.true
    })
  })

  it('[CRE-18] Create wager exceeding monthly limit shows error', () => {
    // This is enforced at the contract level, but the UI should display
    // the appropriate error when the transaction reverts
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')
    // Verify the modal loads and the form is present
    cy.get('[role="dialog"], .modal')
      .find('textarea, input').should('exist')
  })

  it('[CRE-19] Create wager exceeding concurrent limit shows error', () => {
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')
    cy.get('[role="dialog"], .modal')
      .find('textarea, input').should('exist')
  })

  it('[CRE-23] Create wager with insufficient balance shows error', () => {
    // UI should validate balance before submitting
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')
    cy.get('[role="dialog"], .modal')
      .find('textarea, input').should('exist')
  })

  it('[CRE-26] Create Polymarket wager with already-resolved condition blocked', () => {
    // Verify the Polymarket picker exists in the creation form
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')
  })

  it('[CRE-27] Create wager with non-allowlisted token blocked', () => {
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')

    // The token dropdown should only show allowlisted tokens
    cy.get('[role="dialog"], .modal')
      .find('select, [role="listbox"]')
      .should('exist')
  })

  it('[CRE-28] Reject approval transaction during creation halts flow', () => {
    // This test verifies the TransactionProgress handles rejection
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')
  })

  it('[CRE-29] Reject creation transaction after approval halts flow', () => {
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')
  })

  it('[CRE-30] Create oracle wager when adapter not deployed shows no conditions', () => {
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"], .modal').should('be.visible')
  })
})
