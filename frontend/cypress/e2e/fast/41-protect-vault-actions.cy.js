// =============================================================================
// 41-protect-vault-actions.cy.js
// Fast-tier E2E for the Protect vault ActionSheet (release 1.14.0, specs 043/049/068).
//
// Runs WITHOUT a chain. Everything asserted here is decided in the client before any signature:
// which of the four vault actions the sheet offers, why it closes the others, and the creation
// defaults that changed — a majority threshold, a starter policy preselected, and the refusal of
// the one configuration this flow will not produce (a single owner, a single approval, no policy).
//
// Deliberately no-chain per the tier admission rule: nothing below submits a transaction or costs
// a member anything. The deploy itself, the guard that ends up in the vault's storage slot, and the
// propose/approve cycle are the on-chain tier's job (full/29-protect-custody.cy.js, CV-01..CV-07).
//
// Sub-issue of #1228. Flows:
//   VA-01 custody.vault-action-sheet   — one door, four actions
//   VA-02 custody.create-vault         — starter policy is the default, and says what it enforces
//   VA-03 custody.create-vault         — threshold follows the owner list until the member sets one
//   VA-04 custody.create-vault         — 1-of-1 with no policy is refused, honestly
//   VA-05 custody.vault-action-sheet   — closed actions are shown with their reason, never hidden
//
// Checklist: VA-01..VA-06
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const OWNER_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const OWNER_C = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const OWNER_D = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'

// Polygon: a real custody chain with Safe v1.4.1 AND the spec-068 ordered policy engine, so the
// sheet offers creation and the starter policy is genuinely available. No RPC is reachable in this
// tier — which is fine, because nothing here reads the chain.
const CUSTODY_CHAIN = 137

function openProtect() {
  cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true, networkId: CUSTODY_CHAIN })
  cy.visit('/wallet?tab=custody')
  cy.get('.custody-panel', { timeout: 15000 }).should('be.visible')
  cy.get('.custody-onchain').should('be.visible')
}

const openSheet = () => cy.get('[data-testid="custody-open-vault-actions"]').click()

function openCreate() {
  openSheet()
  cy.get('[data-testid="vault-action-create"]').click()
  cy.get('form.custody-create').should('be.visible')
}

function addOwner(address) {
  cy.get('form.custody-create').contains('button', 'Add owner').click()
  cy.get('form.custody-create input[id^="owner-"]').last().clear().type(address)
}

describe('Protect — vault ActionSheet (release 1.14.0)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // VA-01 — one door, four actions
  // ---------------------------------------------------------------------------
  it('[VA-01] opens one sheet offering all four vault actions', () => {
    openProtect()
    // Closed by default: the sheet is a door, not a permanent panel taking up the card.
    cy.get('[data-testid="vault-action-create"]').should('not.exist')

    openSheet()
    cy.get('[role="dialog"]').should('be.visible')
    cy.get('[data-testid="vault-action-create"]').should('be.visible').and('not.be.disabled')
    cy.get('[data-testid="vault-action-load"]').should('be.visible').and('not.be.disabled')
    cy.get('[data-testid="vault-action-propose"]').should('be.visible')
    cy.get('[data-testid="vault-action-approve"]').should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // VA-02 — the starter policy is the default, and it states what it will enforce
  // ---------------------------------------------------------------------------
  it('[VA-02] preselects a starter policy and shows the rules it will deploy', () => {
    openProtect()
    openCreate()
    cy.get('#vault-policy-starter').should('be.checked')
    cy.get('#vault-policy-none').should('not.be.checked')
    // The summary is rendered from the ENCODED rules, so it cannot claim something the deployed
    // vault will not enforce.
    cy.get('form.custody-create')
      .contains(/these rules will be active from the first transaction/i)
      .should('be.visible')
    cy.get('form.custody-create').contains(/must pass between fund movements/i).should('exist')
    cy.get('form.custody-create').contains('button', 'Create vault').should('not.be.disabled')
  })

  // ---------------------------------------------------------------------------
  // VA-03 — the threshold suggestion follows the owner list, then stops
  // ---------------------------------------------------------------------------
  it('[VA-03] suggests a majority threshold that follows the owner list until the member sets one', () => {
    openProtect()
    openCreate()
    cy.get('#vault-threshold').should('have.value', '1') // one owner

    addOwner(OWNER_B)
    cy.get('#vault-threshold').should('have.value', '1') // ceil(2/2)

    addOwner(OWNER_C)
    cy.get('#vault-threshold').should('have.value', '2') // ceil(3/2)
    cy.get('form.custody-create').contains(/suggested: 2 of 3 owners/i).should('be.visible')

    // Once the member states a number it is theirs — adding a fourth owner must not move it.
    cy.get('#vault-threshold').type('{selectall}3').should('have.value', '3')
    addOwner(OWNER_D)
    cy.get('#vault-threshold').should('have.value', '3')
    cy.get('form.custody-create').contains(/suggested:/i).should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // VA-04 — the 1-of-1-with-no-policy refusal, and both ways out of it
  // ---------------------------------------------------------------------------
  it('[VA-04] refuses a single-owner vault with no policy, and says what to do instead', () => {
    openProtect()
    openCreate()

    cy.get('#vault-policy-none').click().should('be.checked')
    cy.get('form.custody-create')
      .contains(/not safer than an ordinary account/i)
      .should('be.visible')
    cy.get('form.custody-create').contains(/add a second owner, or keep a policy/i).should('exist')
    cy.get('form.custody-create').contains('button', 'Create vault').should('be.disabled')
    cy.get('form.custody-create').contains('button', 'Preview address').should('be.disabled')

    // Way out #1 — a second owner, so one stolen key is not enough.
    addOwner(OWNER_B)
    cy.get('form.custody-create').contains(/not safer than an ordinary account/i).should('not.exist')
    cy.get('form.custody-create').contains('button', 'Create vault').should('not.be.disabled')

    // Way out #2 — keep a policy, so the chain limits what one key can do.
    cy.get('form.custody-create [aria-label="Remove owner 2"]').click()
    cy.get('form.custody-create').contains('button', 'Create vault').should('be.disabled')
    cy.get('#vault-policy-starter').click().should('be.checked')
    cy.get('form.custody-create').contains(/not safer than an ordinary account/i).should('not.exist')
    cy.get('form.custody-create').contains('button', 'Create vault').should('not.be.disabled')
  })

  // ---------------------------------------------------------------------------
  // VA-05 — a closed action is shown with its reason, never withdrawn
  // ---------------------------------------------------------------------------
  it('[VA-05] states why propose and approve are closed with no vault open', () => {
    openProtect()
    openSheet()
    cy.get('[data-testid="vault-action-propose"]')
      .should('be.disabled')
      .and('contain.text', 'Open a vault in the list below first')
    cy.get('[data-testid="vault-action-approve"]')
      .should('be.disabled')
      .and('contain.text', 'Open a vault in the list below first')
    // Creating and loading need no vault, so they stay open — the sheet distinguishes the two.
    cy.get('[data-testid="vault-action-create"]').should('not.be.disabled')
  })

  // ---------------------------------------------------------------------------
  // VA-06 — navigation: back to the chooser, and Escape closes the sheet
  // ---------------------------------------------------------------------------
  it('[VA-06] returns to the chooser, and reopening never lands on an abandoned form', () => {
    openProtect()
    openCreate()
    cy.get('[data-testid="vault-action-back"]').click()
    cy.get('[data-testid="vault-action-create"]').should('be.visible')
    cy.get('form.custody-create').should('not.exist')

    // The shell's own Escape/backdrop handling has unit coverage (ActionSheet); what matters here
    // is that closing this sheet forgets where the member was.
    cy.get('[role="dialog"] [aria-label="Close"]').click()
    cy.get('[role="dialog"]').should('not.exist')
    // Reopening lands on the chooser, never on a form the member walked away from.
    openSheet()
    cy.get('[data-testid="vault-action-create"]').should('be.visible')
    cy.get('form.custody-create').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // Accessibility — the sheet is a modal dialog the app portals over the page, so the scan is
  // scoped to its own root (spec 094).
  // ---------------------------------------------------------------------------
  it('[VA-A11Y] the open vault sheet has no serious or critical violations', () => {
    openProtect()
    openSheet()
    cy.get('[role="dialog"]').then(($sheet) => {
      cy.a11yScan({ context: $sheet[0], label: 'vault action sheet' })
    })
  })
})
