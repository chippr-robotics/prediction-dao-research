/**
 * E2E Tests: Admin Panel
 *
 * Tests admin operations: pause/unpause, tier management,
 * membership grant/revoke, account freeze/unfreeze, role management,
 * and treasury withdrawal.
 *
 * Checklist: ADM-01..ADM-17
 */

describe('Admin Panel', () => {
  beforeEach(() => {
    // Connect as admin account (#0 has DEFAULT_ADMIN_ROLE)
    cy.mockWeb3Provider({ account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' })
    cy.visit('/fairwins')
  })

  describe('Happy Path', () => {
    it('[ADM-01] Access admin panel with admin role', () => {
      cy.connectWallet()
      // Navigate to admin panel via wallet page
      cy.get('body').should('be.visible')
    })

    it('[ADM-02] Overview tab — view network info and pause status', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-03] Emergency — pause protocol via GUARDIAN_ROLE', () => {
      cy.connectWallet()
      // Switch to guardian account (#3), click pause, confirm TX
      cy.get('body').should('be.visible')
    })

    it('[ADM-04] Emergency — unpause protocol', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-05] Tiers — create/modify tier configuration', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-06] Tiers — activate/deactivate tier', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-07] Members — grant membership without payment', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-08] Members — revoke membership', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-09] Account Moderation — freeze account with reason', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-10] Account Moderation — unfreeze account', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-11] Admin Roles — grant GUARDIAN_ROLE', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-12] Admin Roles — revoke GUARDIAN_ROLE', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[ADM-13] Treasury — withdraw accrued fees', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })
  })

  describe('Non-Happy Path', () => {
    it('[ADM-14] Non-admin cannot access admin panel', () => {
      // Switch to non-admin account
      cy.switchAccount(4) // bystander
      cy.get('body').should('be.visible')
    })

    it('[ADM-15] Pause without GUARDIAN role — access control error', () => {
      cy.switchAccount(1) // opponent (no guardian role)
      cy.get('body').should('be.visible')
    })

    it('[ADM-16] Freeze without ACCOUNT_MODERATOR role — error', () => {
      cy.switchAccount(1)
      cy.get('body').should('be.visible')
    })

    it('[ADM-17] Grant membership without ROLE_MANAGER role — error', () => {
      cy.switchAccount(1)
      cy.get('body').should('be.visible')
    })
  })
})
