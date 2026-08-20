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
 *   CV-04 custody.policy-v2-adoption  — the vault CONSENTS to the ordered guard, by threshold
 *
 * Checklist: CV-01..CV-04
 */

const OWNER_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0 — the connected member
const OWNER_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // #1 — co-owner
const ONE_COIN = (10n ** 18n).toString()
const NO_GUARD = '0x0000000000000000000000000000000000000000'
/*
 * The ordered engine the app is built with (HARDHAT_CONTRACTS.safePolicyGuardV2). Adoption is
 * judged by the vault's own guard slot holding exactly this — a vault is on v2 because it said so
 * on chain, never because the UI drew a badge.
 */
const GUARD_V2 = '0xc01E5F3EAFd2C0138e98382A3F54B6CeB3dc05cf'
/*
 * The PENDING queue only. History rows carry the same `custody-proposal-row` class, so an
 * unscoped count says "still queued" about a proposal that executed a minute ago.
 */
const PENDING_ROW = '.custody-proposal-list:not(.custody-proposal-list--history) .custody-proposal-row'

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

/** Poll the VAULT until its guard slot holds `expected`. */
function waitForGuard(address, expected, tries = 30) {
  return fixture('vaultInfo', { address }).then((info) => {
    if (info.guard.toLowerCase() === expected.toLowerCase()) return info
    if (tries <= 0) {
      throw new Error(`vault ${address} still reports guard ${info.guard}, expected ${expected}`)
    }
    cy.wait(1000, { log: false })
    return waitForGuard(address, expected, tries - 1)
  })
}

/** Become the co-owner and bring the vault into THEIR list (references are per-member). */
function asCoOwner(address) {
  cy.switchAccount(1)
  cy.visit('/wallet?tab=custody')
  cy.get('.custody-panel', { timeout: 20000 }).should('be.visible')
  loadVault(address, 'Co-owner view')
  openVaultCard()
}

/**
 * Approve and execute the TOP proposal, leaving `remaining` in the queue.
 *
 * One at a time on purpose: a multi-step change (adoption is two — configure the rules, then point
 * the guard slot at them) is proposed at consecutive nonces, so the second is not executable until
 * the first has landed. Draining the queue in order is what an owner actually does, and it is the
 * only order the chain will accept.
 */
function approveAndExecuteTop(remaining) {
  cy.get(PENDING_ROW, { timeout: 60000 })
    .first()
    .within(() => cy.contains('button', 'Approve').click())
  cy.get(PENDING_ROW, { timeout: 60000 })
    .first()
    .within(() => cy.contains('button', 'Execute').click())
  cy.get(PENDING_ROW, { timeout: 60000 }).should('have.length', remaining)
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
      cy.get(PENDING_ROW, { timeout: 60000 }).should('have.length.at.least', 1)
      fixture('vaultInfo', { address }).then((info) => {
        expect(info.threshold, 'one approval does not change a 2-of-2').to.equal(2)
      })

      /*
       * The co-owner approves, which is what a second owner actually does — including bringing
       * the vault into THEIR list. The saved vault references are per-member and device-local, so
       * owner B does not inherit owner A's; a test that assumed otherwise would be asserting on a
       * shared list the product deliberately does not have.
       */
      asCoOwner(address)
      approveAndExecuteTop(0)

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

  // ---------------------------------------------------------------------------
  // CV-04 — adopting the ordered guard is the VAULT's decision, taken by threshold
  // ---------------------------------------------------------------------------
  it('[CV-04] adopts the ordered policy guard only once the owners approve setGuard', () => {
    fixture('createVault', { owners: [OWNER_A, OWNER_B], threshold: 2 }).then(({ address }) => {
      fixture('fundVault', { address, amount: ONE_COIN })
      openProtect()
      loadVault(address)
      openVaultCard()

      // A vault starts with no guard, and migration is vault-consented — never release-time.
      fixture('vaultInfo', { address }).then((info) => {
        expect(info.guard, 'no guard before the owners adopt one').to.equal(NO_GUARD)
      })

      cy.get('.custody-policy', { timeout: 20000 }).within(() => {
        cy.contains('button', /Add rules|Upgrade to ordered rules/).click()
        cy.contains('button', 'Add a rule').click()
      })
      // The composer's defaults describe a permissive first rule; this test is about ADOPTION,
      // so what the rule says matters less than the vault agreeing to be governed at all.
      cy.get('.custody-policy').within(() => {
        cy.contains('button', /^(Save|Add) rule/).click()
        cy.contains('button', 'Propose policy change').click()
      })

      /*
       * Adoption is TWO transactions, at consecutive nonces: configure the rules (inert while no
       * guard is active), then point the vault's guard slot at the engine. Both are proposed at
       * once, and the vault is governed only after BOTH land — asserted below, because a test that
       * executed one and saw a guard would be describing a product that cannot exist.
       */
      cy.get(PENDING_ROW, { timeout: 60000 }).should('have.length', 2)
      fixture('vaultInfo', { address }).then((info) => {
        expect(info.guard, 'still ungoverned on one approval').to.equal(NO_GUARD)
      })

      asCoOwner(address)
      approveAndExecuteTop(1)
      // The rules landed first, and they are inert: the vault is still ungoverned.
      fixture('vaultInfo', { address }).then((info) => {
        expect(info.guard, 'rules alone do not govern a vault').to.equal(NO_GUARD)
      })
      approveAndExecuteTop(0)

      waitForGuard(address, GUARD_V2).then((info) => {
        expect(info.threshold, 'adoption does not change the owner set or threshold').to.equal(2)
      })
    })
  })
})
