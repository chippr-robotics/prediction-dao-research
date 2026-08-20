/**
 * E2E Tests: Protect — Safe custody and the policy guards (specs 043 / 049 / 068, Full-tier)
 *
 * WIP probe — CV-01 only, to prove the local Safe estate is reachable from the UI.
 */

const OWNER_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0 — the connected member
const OWNER_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // #1 — co-owner

function openProtect() {
  cy.mockWeb3Provider({ account: OWNER_A, preAuthorized: true, realBalances: true })
  cy.visit('/wallet?tab=custody')
  cy.get('.custody-panel', { timeout: 20000 }).should('be.visible')
}

describe('Protect — Safe custody (spec 043)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    openProtect()
  })

  it('[CV-01] creates a 2-of-2 vault on chain and lists it', () => {
    // Custody must be OFFERED here at all — if the Safe estate is missing this reads as
    // "New vaults cannot be created on this network" and everything below is moot.
    cy.get('.custody-onchain').should('be.visible')
    cy.contains('.custody-onchain button', 'Create vault').click()

    cy.get('form.custody-create').within(() => {
      cy.get('#owner-0').clear().type(OWNER_A)
      cy.contains('button', 'Add owner').click()
      cy.get('#owner-1').clear().type(OWNER_B)
      /*
       * Replace the selection in ONE action. The field's onChange runs the value through
       * `Number(...)`, so an empty intermediate state becomes 0 and the next keystroke lands
       * beside it ("2" after a clear reads as "20"). Asserted, because the wizard silently
       * disables Create when threshold > owners.
       */
      cy.get('#vault-threshold').type('{selectall}2').should('have.value', '2')
      cy.get('#vault-label').type('E2E Vault')
      cy.contains('button', 'Create vault').click()
    })

    cy.get('.custody-vault-card', { timeout: 60000 }).should('have.length.at.least', 1)
    cy.get('.custody-vault-card__label').should('contain.text', 'E2E Vault')
  })
})
