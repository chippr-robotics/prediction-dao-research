/**
 * E2E Tests: Protect — Safe custody and the policy guards (specs 043 / 049 / 068, Full-tier)
 *
 * Custody vaults hold member funds behind a guard that is deliberately NOT upgradeable, so what
 * matters here is what the CHAIN accepted, never what the screen said: every outcome below is read
 * back from the vault itself (owners, threshold, nonce, guard slot, balances).
 *
 * Requires `npm run setup:e2e`, which now runs `setup:e2e:custody` — a fresh node has no Safe
 * behind the canonical addresses the app hard-codes, and no policy guards. The `custodyFixture`
 * task fails loudly rather than mysteriously if that step was skipped.
 *
 * Only CV-01 drives the creation wizard, because only CV-01 is about creating a vault. The rest
 * take an on-chain vault from the fixture and bring it in through the app's own "Load existing"
 * path, so each test spends its assertions on its own flow.
 *
 * CV-02 drives the cycle through a governance change rather than a transfer, because the
 * governance panel is the ONLY propose-from-Protect path by design: there is deliberately no
 * vault-shaped send form, since spending from a vault is a normal transfer made while the vault is
 * your acting account — which is CV-03.
 *
 * Sub-issue of #1228. Flows:
 *   CV-01 custody.create-vault        — create a vault and add its owners
 *   CV-02 custody.propose-and-execute — propose, collect approvals, execute
 *   CV-03 custody.operate-as-vault    — act as the vault, and see which you are
 *
 * Checklist: CV-01..CV-03
 */

const OWNER_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0 — the connected member
const OWNER_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // #1 — co-owner
const ONE_COIN = (10n ** 18n).toString()

const fixture = (action, args = {}) =>
  cy.task('custodyFixture', { action, args }).then((r) => {
    expect(r.ok, `custodyFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

/**
 * Poll the VAULT until it reports the expected threshold.
 *
 * A retrying chain read, not a screen assertion: the vault is the authority on its own
 * configuration, and a UI that renders the new threshold before the transaction lands (or never
 * refreshes after it does) must not be able to pass or fail this on its own.
 */
function waitForThreshold(address, expected, tries = 30) {
  return fixture('vaultInfo', { address }).then((info) => {
    if (info.threshold === expected) return info
    if (tries <= 0) {
      throw new Error(`vault ${address} still reports threshold ${info.threshold}, expected ${expected}`)
    }
    cy.wait(1000, { log: false })
    return waitForThreshold(address, expected, tries - 1)
  })
}

function openProtect(account = OWNER_A) {
  cy.mockWeb3Provider({ account, preAuthorized: true, realBalances: true })
  cy.visit('/wallet?tab=custody')
  cy.get('.custody-panel', { timeout: 20000 }).should('be.visible')
}

/** Bring an existing on-chain vault into the app the way a member would: by address. */
function loadVault(address, label = 'E2E Vault') {
  cy.contains('.custody-onchain button', 'Load existing').click()
  cy.get('form.custody-load').within(() => {
    cy.get('#load-address').clear().type(address)
    cy.get('#load-label').clear().type(label)
    cy.contains('button', /^Load/).click()
  })
  cy.get('.custody-vault-card', { timeout: 30000 }).should('have.length.at.least', 1)
}

/** Expand the one vault card, so its detail and proposal queue mount. */
function openVaultCard() {
  cy.get('.custody-vault-card').first().then(($card) => {
    if ($card.attr('data-open') !== 'true') {
      cy.wrap($card).find('.acc__trigger').first().click()
    }
  })
  cy.get('.custody-vault-card').first().should('have.attr', 'data-open', 'true')
}

describe('Protect — Safe custody (specs 043 / 049 / 068)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // CV-01 — create a vault and its owner set, judged by the deployed Safe
  // ---------------------------------------------------------------------------
  it('[CV-01] creates a 2-of-2 vault on chain and lists it', () => {
    openProtect()

    // Custody must be OFFERED here at all — without the Safe estate this reads as "New vaults
    // cannot be created on this network" and everything below is moot.
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

    // The card is a claim; the chain is the fact. Read the deployed Safe back.
    cy.get('.custody-vault-card').first().invoke('attr', 'data-attention').then((address) => {
      fixture('vaultInfo', { address }).then((info) => {
        expect(info.version, 'a real Safe v1.4.1').to.equal('1.4.1')
        expect(info.threshold, 'threshold as entered').to.equal(2)
        expect(info.owners.map((o) => o.toLowerCase()), 'both owners').to.have.members([
          OWNER_A.toLowerCase(), OWNER_B.toLowerCase(),
        ])
        expect(info.guard, 'a new vault has no policy guard until one is adopted')
          .to.equal('0x0000000000000000000000000000000000000000')
      })
    })
  })

  // ---------------------------------------------------------------------------
  // CV-02 — propose, collect the second approval, execute
  // ---------------------------------------------------------------------------
  it('[CV-02] holds a governance change until both owners approve, then executes it', () => {
    fixture('createVault', { owners: [OWNER_A, OWNER_B], threshold: 2 }).then(({ address }) => {
      fixture('fundVault', { address, amount: ONE_COIN })
      openProtect()
      loadVault(address)
      openVaultCard()

      // Propose lowering the threshold to 1. A 2-of-2 cannot make this change on one signature,
      // which is exactly what the test needs to observe.
      cy.get('.custody-governance', { timeout: 20000 }).within(() => {
        cy.contains('button', 'Change threshold').click()
        cy.get('#gov-threshold').type('{selectall}1').should('have.value', '1')
        cy.contains('button', /^Propose/).click()
      })

      // Queued, not applied — the vault still says 2.
      cy.get('.custody-proposal-row', { timeout: 60000 }).should('have.length.at.least', 1)
      fixture('vaultInfo', { address }).then((info) => {
        expect(info.threshold, 'one approval does not change a 2-of-2').to.equal(2)
      })

      /*
       * The co-owner approves, which is what a second owner actually does — including bringing
       * the vault into THEIR list. The saved vault references are per-member and device-local, so
       * owner B does not inherit owner A's; a test that assumed otherwise would be asserting on a
       * shared list the product deliberately does not have.
       */
      cy.switchAccount(1)
      cy.visit('/wallet?tab=custody')
      cy.get('.custody-panel', { timeout: 20000 }).should('be.visible')
      loadVault(address, 'Co-owner view')
      openVaultCard()
      cy.get('.custody-proposal-row', { timeout: 60000 })
        .first()
        .within(() => cy.contains('button', 'Approve').click())

      // With both approvals in it becomes executable — and only executing changes the vault.
      cy.get('.custody-proposal-row', { timeout: 60000 })
        .first()
        .within(() => cy.contains('button', 'Execute').click())

      waitForThreshold(address, 1).then((info) => {
        expect(info.nonce, 'the vault executed exactly one transaction').to.equal(1)
        expect(info.owners.length, 'the owner set is unchanged by a threshold change').to.equal(2)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // CV-03 — act as the vault, and be told plainly which account you are
  // ---------------------------------------------------------------------------
  it('[CV-03] switches the acting identity to the vault and says so', () => {
    fixture('createVault', { owners: [OWNER_A, OWNER_B], threshold: 2 }).then(({ address }) => {
      fixture('fundVault', { address, amount: ONE_COIN })
      openProtect()
      loadVault(address, 'Ops Vault')

      // The account menu is the ONE way to change acting account — Protect deliberately has no
      // "Operate as this vault" button of its own. It lives inside the wallet dropdown, and the
      // identity trigger only renders once there is something to switch TO (a loaded vault).
      cy.get('.wallet-account-button', { timeout: 20000 }).click()
      cy.get('.account-identity-trigger', { timeout: 20000 }).click()
      cy.get('.account-switch-menu').within(() => {
        cy.contains('.account-switch-opt', 'Ops Vault').click()
      })

      // Being the vault has to be VISIBLE — acting as a multisig while the UI still shows the
      // member's own account is how somebody signs the wrong thing.
      cy.get('.account-address-full', { timeout: 20000 })
        .invoke('attr', 'title')
        .should('eq', address)
      cy.get('.custody-vault-card').first().should('exist')
    })
  })
})
