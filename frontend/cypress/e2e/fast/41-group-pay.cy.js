// =============================================================================
// 41-group-pay.cy.js
// Fast-tier E2E for group pay (release 1.14.0) on Transfer ▸ Send.
//
// NO CHAIN, and deliberately so. Everything here happens BEFORE a signature: how a
// recipient list is built and torn down, which recipients are refused and with what
// reason, and what the confirm screen discloses about the whole payment (the total,
// who gets what, how it will be submitted and who pays the fee).
//
// The SETTLEMENT — one batched transaction, one vault proposal, or N sequential sends
// with per-recipient outcomes — costs the member money and therefore belongs to the
// on-chain tier (e2e-testing-policy.md admission rule 2). It is tracked as absent
// under issue #1366; nothing in this file signs or moves value.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const PAYEE_ONE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const PAYEE_TWO = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const BITCOIN_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

const addrRow = (n) => cy.get('input[id^="pt-gp-addr-"]').eq(n - 2)
const amtRow = (n) => cy.get('input[id^="pt-gp-amt-"]').eq(n - 2)

const draftPrimary = (amount = '1') => {
  cy.get('#pt-to', { timeout: 20000 }).type(PAYEE_ONE, { delay: 0 })
  cy.get('#pt-amount').type(amount, { delay: 0 })
}

describe('Group pay — building the recipient list (release 1.14.0)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
    cy.visit('/wallet?tab=paytransfer')
    cy.get('[data-testid="group-pay-add"]', { timeout: 20000 }).should('be.visible')
  })

  it('[GP-01] the send form starts as a single-recipient form with one new control', () => {
    // The list is additive: nothing exists until the member asks for it.
    cy.get('[data-testid="group-pay-row"]').should('not.exist')
    cy.get('#pt-to').should('exist')
    cy.get('#pt-amount').should('exist')
  })

  it('[GP-02] adding and removing a recipient is reversible, and the action names the count', () => {
    draftPrimary('1')
    cy.get('[data-testid="group-pay-add"]').click()
    cy.get('[data-testid="group-pay-row"]').should('have.length', 1)

    addrRow(2).type(PAYEE_TWO, { delay: 0 })
    amtRow(2).type('2', { delay: 0 })

    // Two recipients — the confirm step names how many people are being paid.
    cy.contains('button', 'Preview').should('be.enabled').click()
    cy.contains('button', /send to 2 recipients/i).should('exist')
    cy.contains('button', 'Back').click()

    cy.get('[aria-label="Remove recipient 2"]').click()
    cy.get('[data-testid="group-pay-row"]').should('not.exist')
    // Back to the single-recipient journey, unchanged.
    cy.contains('button', 'Preview').click()
    cy.contains('button', 'Send').should('exist')
    cy.get('[data-testid="group-pay-confirm"]').should('not.exist')
  })

  it('[GP-03] a Bitcoin recipient is refused BY NAME, and the payment cannot be previewed', () => {
    draftPrimary('1')
    cy.get('[data-testid="group-pay-add"]').click()
    addrRow(2).type(BITCOIN_ADDRESS, { delay: 0 })
    amtRow(2).type('1', { delay: 0 })

    // Not "invalid address" — that would be a false statement about a perfectly good
    // Bitcoin address. The refusal names the chain and points at the surface that can send it.
    cy.get('[data-testid="group-pay-row"]')
      .find('[role="alert"]')
      .should('contain.text', 'Bitcoin')
    cy.contains('button', 'Preview').should('be.disabled')
  })

  it('[GP-04] a duplicate recipient is FLAGGED, not refused', () => {
    draftPrimary('1')
    cy.get('[data-testid="group-pay-add"]').click()
    addrRow(2).type(PAYEE_ONE, { delay: 0 })
    amtRow(2).type('2', { delay: 0 })

    cy.get('[data-testid="group-pay-row"]').should('contain.text', 'appears more than once')
    // Paying one person two amounts is a legitimate thing to want, so it stays possible.
    cy.get('[data-testid="group-pay-row"]').find('[role="alert"]').should('not.exist')
    cy.contains('button', 'Preview').should('be.enabled')
  })

  it('[GP-05] an incomplete row blocks the payment until it is filled or removed', () => {
    draftPrimary('1')
    cy.get('[data-testid="group-pay-add"]').click()
    cy.contains('button', 'Preview').should('be.disabled')
    addrRow(2).type(PAYEE_TWO, { delay: 0 })
    amtRow(2).type('2', { delay: 0 })
    cy.contains('button', 'Preview').should('be.enabled')
  })
})

describe('Group pay — what the confirm screen discloses (release 1.14.0)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
    cy.visit('/wallet?tab=paytransfer')
    cy.get('[data-testid="group-pay-add"]', { timeout: 20000 }).should('be.visible')
    draftPrimary('1')
    cy.get('[data-testid="group-pay-add"]').click()
    addrRow(2).type(PAYEE_TWO, { delay: 0 })
    amtRow(2).type('2', { delay: 0 })
    cy.contains('button', 'Preview').should('be.enabled').click()
    cy.get('[data-testid="group-pay-confirm"]', { timeout: 20000 }).should('be.visible')
  })

  it('[GP-06] the total and a per-recipient breakdown are both shown before signing', () => {
    cy.get('[data-testid="group-pay-breakdown-row"]').should('have.length', 2)
    cy.get('[data-testid="group-pay-total"]').should('contain.text', '3')
  })

  it('[GP-07] the confirm states how the payment will be submitted and who pays the fee', () => {
    cy.get('[data-testid="group-pay-rail"]')
      .should('be.visible')
      // Either "one transaction/proposal carrying all N" or "N separate transactions" —
      // whichever is true for this signer. Both name the number of payments.
      .and('contain.text', '2')
    // A fee statement is present and is never silent about who pays.
    cy.get('[data-testid="group-pay-rail"]')
      .invoke('text')
      .should('match', /no network fee|you pay|vault pays/i)
  })

  it('[GP-08] Back returns to the editable draft with every recipient intact', () => {
    cy.contains('button', 'Back').click()
    cy.get('[data-testid="group-pay-confirm"]').should('not.exist')
    cy.get('#pt-to').should('have.value', PAYEE_ONE)
    addrRow(2).should('have.value', PAYEE_TWO)
    amtRow(2).should('have.value', '2')
  })

  it('[GP-09] the group confirm has no serious or critical accessibility violations', () => {
    cy.a11yScan({ context: '.pt-form', label: 'group pay confirm' })
  })
})
