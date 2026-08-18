/**
 * E2E Tests: Admin Panel (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Verifies the admin control surface renders for an admin (account #0, which the
 * local deploy seeds with all admin roles) and that a non-admin is denied. These
 * are read-only UI assertions — no state-mutating transactions.
 *
 * Checklist: ADM-01..ADM-17
 */

const ADMIN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'    // #0 — all admin roles
const NON_ADMIN = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' // #4 — no roles

function connectThenVisitAdmin(account) {
  cy.mockWeb3Provider({ account })
  cy.visit('/fairwins')
  cy.connectWallet()
  cy.visit('/admin')
}

describe('Admin Panel', () => {
  /*
   * Spec 093 replaced the single tabbed panel with a Control Room: `/admin` is a launcher of
   * app tiles and each group of controls lives at `/admin/<appId>?view=<viewId>`. The old
   * assertions looked for tab BUTTONS named "Tiers"/"Treasury" on `/admin` itself, which is now
   * a page of tiles — hence the timeout on /tiers/i. App and view ids come from
   * components/admin/adminApps.js, the single app/view/role matrix.
   */
  it('[ADM-01] an admin sees the control sections and the treasury-default withdrawal recipient', () => {
    connectThenVisitAdmin(ADMIN)

    // The Control Room lists the apps this admin is entitled to.
    cy.contains(/membership & revenue/i, { timeout: 15000 }).should('be.visible')
    cy.contains(/incident response/i).should('be.visible')
    cy.contains(/access control/i).should('be.visible')

    // Tier config controls.
    cy.visit('/admin/membership-revenue?view=tiers')
    cy.contains(/configure tier/i, { timeout: 15000 }).should('be.visible')

    // Freeze / unfreeze controls.
    cy.visit('/admin/incident-response?view=moderation')
    cy.contains(/freeze\s*\/\s*unfreeze/i, { timeout: 15000 }).should('be.visible')

    // Treasury withdrawal: recipient pre-filled with the on-chain treasury address.
    cy.visit('/admin/membership-revenue?view=treasury')
    cy.contains(/treasury withdrawal/i, { timeout: 15000 }).should('be.visible')
    cy.get('input[placeholder*="name.eth"]').invoke('val').should('match', /^0x[0-9a-fA-F]{40}$/)
  })

  it('[ADM-02] a non-admin is denied access to the admin panel', () => {
    connectThenVisitAdmin(NON_ADMIN)
    cy.contains(/access restricted/i, { timeout: 15000 }).should('be.visible')
    cy.contains(/configure tier/i).should('not.exist')
  })
})
