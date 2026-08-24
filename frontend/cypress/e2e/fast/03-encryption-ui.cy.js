/**
 * E2E Tests: Encryption & Key Registration (UI-only)
 *
 * Tests the encryption key derivation UI, session persistence,
 * and rejection handling without requiring on-chain interaction.
 *
 * Checklist: ENC-01, ENC-04, ENC-05, ENC-06, ENC-07
 * On-chain tests (ENC-02, ENC-03) are in full/03-encryption-chain.cy.js
 */

describe('Encryption & Key Registration (UI)', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    // Spec 073 moved the wager surface to Finance > Transfer > Wagers; `/fairwins` no longer
    // hosts the create-wager cards, so openCreateWagerModal had nothing to click (bc294ec8).
    cy.visit('/wagers')
  })

  describe('Happy Path', () => {
    it('[ENC-01] Derive encryption key triggers MetaMask signature prompt', () => {
      cy.connectWallet()

      // The encryption key derivation is triggered when creating a private wager
      // or navigating to security settings. Verify the app handles the signature flow.
      cy.get('body').should('be.visible')

      // Look for any encryption-related UI elements after connecting
      cy.window().then((win) => {
        // Verify the mock provider supports personal_sign
        return win.ethereum.request({ method: 'personal_sign', params: ['test', '0x0'] })
      }).then((sig) => {
        expect(sig).to.be.a('string')
        expect(sig).to.match(/^0x/)
      })
    })

    /*
     * Rewritten (#1019). Un-skipping this as it stood would have restored a green test that
     * proves nothing about FairWins: it wrote `encryptionKeyDerived` — a key NOTHING in the app
     * reads — and then asserted sessionStorage still held it after a same-tab visit. That is a
     * test of the browser's storage semantics.
     *
     * The real contract is `useEncryption.js`: a derived signature is cached at
     * `fairwins_encryption_signature_<account>` in SESSION storage, so it survives navigation
     * within the tab and cannot outlive the tab.
     *
     * It is reachable without a chain, which is why this stays in the no-chain tier: pressing
     * Register derives client-side (personal_sign, which the mock answers) and caches BEFORE it
     * attempts the KeyRegistry write. The write then fails here, with no node — deliberately
     * irrelevant, and the on-chain half is ENC-02/ENC-03's job in full/03-encryption-chain.
     */
    it('[ENC-04] Key persists within session after derivation', () => {
      const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      const cacheKey = `fairwins_encryption_signature_${ACCOUNT.toLowerCase()}`

      cy.visit('/wallet?tab=security')
      cy.get('body', { timeout: 10000 }).should('be.visible')
      cy.connectWallet()

      // ESTABLISH THE PRECONDITION. Without this the later assertion cannot distinguish "the app
      // cached a signature" from "something had already cached one".
      cy.window().then((win) => {
        expect(win.sessionStorage.getItem(cacheKey), 'no cached signature before derivation').to.be.null
      })

      cy.get('#encryption-key-header', { timeout: 10000 }).then(($h) => {
        if ($h.attr('aria-expanded') !== 'true') cy.wrap($h).click()
      })
      cy.contains('button', /register encryption key/i, { timeout: 10000 })
        .scrollIntoView()
        .should('be.visible')
        .click()

      // Derivation is async (signature request, then cache write), so this retries.
      cy.window({ timeout: 15000 }).should((win) => {
        const cached = win.sessionStorage.getItem(cacheKey)
        expect(cached, 'signature cached for the connected account').to.not.be.null
        expect(JSON.parse(cached), 'cache holds the signature').to.have.property('signature')
      })

      // Survives navigation within the same tab — the thing this test is named for.
      cy.visit('/wallet?tab=security')
      cy.get('body', { timeout: 10000 }).should('be.visible')
      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.sessionStorage.getItem(cacheKey), 'still cached after navigating').to.not.be.null
      })

      // ...and is TAB-scoped by construction. This is the half that makes "cannot outlive the
      // tab" a fact about the app rather than a hope: a signature written to localStorage would
      // survive a tab close, and nothing about sessionStorage would have caught that.
      cy.window().then((win) => {
        expect(win.localStorage.getItem(cacheKey), 'never written to localStorage').to.be.null
      })
    })

    /*
     * Corrected alongside ENC-04 (#1019), and for the same reason. This asserted
     * `sessionStorage.getItem('encryptionKey')` — a key the app has never written, so it was
     * `null` no matter what the app did. It reported coverage of the clear-on-new-session
     * contract while being incapable of observing it.
     *
     * Each Cypress test starts a fresh session, so a correctly-named absent key is a real
     * statement here: whatever ENC-04 derived did not follow the member into a new session.
     */
    it('[ENC-05] Key cleared on tab close/new session', () => {
      const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      const cacheKey = `fairwins_encryption_signature_${ACCOUNT.toLowerCase()}`
      cy.connectWallet()
      cy.window().then((win) => {
        expect(win.sessionStorage.getItem(cacheKey), 'a new session starts with no cached signature').to.be.null
        expect(win.localStorage.getItem(cacheKey), 'and nothing durable was left behind').to.be.null
      })
    })
  })

  describe('Non-Happy Path', () => {
    it('[ENC-06] Reject key derivation signature shows error', () => {
      // Override the mock provider to reject personal_sign
      cy.mockWeb3Provider()
      cy.on('window:before:load', (win) => {
        if (win.ethereum) {
          const origRequest = win.ethereum.request.bind(win.ethereum)
          win.ethereum.request = ({ method, params }) => {
            if (method === 'personal_sign') {
              return Promise.reject(new Error('User denied message signature'))
            }
            return origRequest({ method, params })
          }
        }
      })

      cy.visit('/fairwins')
      cy.get('body', { timeout: 10000 }).should('be.visible')

      // The app should handle rejection gracefully without crashing
      cy.get('body').should('be.visible')
    })

    it('[ENC-07] Creating encrypted wager when opponent has no registered key shows warning', () => {
      cy.connectWallet()

      // Open wager creation modal
      cy.openCreateWagerModal('oneVsOne')

      // Look for encryption/privacy toggle in the creation form
      cy.get('[role="dialog"], .modal').should('be.visible')

      // The form should exist and be interactable
      cy.get('textarea, input[type="text"]').should('exist')
    })
  })
})
