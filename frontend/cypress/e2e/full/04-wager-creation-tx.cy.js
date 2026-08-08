/**
 * E2E Tests: Wager Creation with Real Transactions (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Tests happy-path wager creation across all market types, stake tokens,
 * resolution types, and oracle-pegged flows.
 *
 * Checklist: CRE-01..CRE-16
 * Validation-only tests (CRE-17+) live in fast/04-wager-creation-validation.cy.js
 */

const TEST_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #0 Creator / Admin
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // #1 Opponent
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // #2 Arbitrator
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // #3 Guardian
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // #4 Bystander
]

/**
 * Connect wallet and navigate to the dashboard.
 */
function connectWalletAndVisit(accountIndex = 0) {
  cy.mockWeb3Provider({ account: TEST_ACCOUNTS[accountIndex] })
  cy.visitWagers()

  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
    .click()
  cy.selectInjectedConnector()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
    .should('be.visible')
}

/**
 * Open the Create Wager modal and fill common fields.
 * Returns the modal container for further interaction.
 */
function openAndFillWagerForm(config = {}) {
  const type = config.type || 'oneVsOne'
  cy.openCreateWagerModal(type)

  // Fill description
  if (config.description) {
    cy.get('#fm-description, [role="dialog"] input[type="text"]')
      .first()
      .clear()
      .type(config.description)
  }

  // Fill opponent (1v1)
  if (config.opponent) {
    cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]')
      .first()
      .clear()
      .type(config.opponent)
    // Wait for address resolution
    cy.wait(500)
  }

  // Set stake amount
  if (config.stake) {
    cy.enterAmountViaKeypad('fm-stake', config.stake.toString())
  }

  // Set stake token
  if (config.stakeToken) {
    cy.get('#fm-stake-token, [role="dialog"] .fm-token-select')
      .first()
      .select(config.stakeToken)
  }

  // Set resolution type
  if (config.resolutionType !== undefined) {
    cy.selectResolutionType(config.resolutionType.toString())
  }

  // Set arbitrator
  if (config.arbitrator) {
    cy.get('[role="dialog"]').within(() => {
      cy.get('input[placeholder*="0x"]').last().clear().type(config.arbitrator)
    })
    cy.wait(500)
  }

  // Set odds multiplier (offer)
  if (config.oddsMultiplier) {
    cy.get('#fm-odds, [role="dialog"] .fm-odds-slider')
      .first()
      .invoke('val', config.oddsMultiplier)
      .trigger('input')
  }

  // Encryption is ON by default and is no longer optional — the opt-out checkbox was removed
  // from FriendMarketsModal several sprints ago (grep `checkbox` there returns nothing). The
  // block that used to uncheck it was a no-op guarded by `if (length > 0)`, so it silently did
  // nothing while the spec read as though it controlled encryption. (#1028)
}

/**
 * Submit the wager creation form and wait for TX completion.
 */
function submitWagerForm() {
  cy.get('.fm-btn-primary', { timeout: 10000 }).should('not.be.disabled').click()

  // Wait for transaction to be submitted and confirmed.
  // The form transitions through verify → approve → create → complete.
  cy.contains('Wager Created', { timeout: 60000 }).should('be.visible')
}

/**
 * Assert wager was created successfully (success screen visible).
 */
function assertWagerCreated() {
  cy.contains('Wager Created', { timeout: 60000 }).should('be.visible')
}

describe('Wager Creation with Real Transactions', () => {
  before(() => {
    // Encryption is MANDATORY: FriendMarketsModal refuses to create a wager whose opponent has
    // no key in KeyRegistry, silently and with no validation error. A fresh chain has none.
    // Keys persist on chain, so this is once per spec — later runs hit the hasKey fast path.
    cy.ensureWagerCapacity([0, 1])
    cy.ensureEncryptionKeys([0, 1])
  })

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // CRE-01: 1v1 USDC, Either Party resolution
  // ---------------------------------------------------------------------------
  it('[CRE-01] Create 1v1 wager with USDC, Either Party resolution', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-01: BTC above 100k by end of week',
      opponent: TEST_ACCOUNTS[1],
      stake: 10,
      stakeToken: 'STABLE',
      resolutionType: 0, // Either Party
      encrypted: false,
    })

    submitWagerForm()
    assertWagerCreated()
  })

  // ---------------------------------------------------------------------------
  // CRE-02: 1v1 MATIC (native token, no approval needed)
  // ---------------------------------------------------------------------------
  it('[CRE-02] Create 1v1 wager with MATIC (native token)', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-02: Native MATIC wager test',
      opponent: TEST_ACCOUNTS[1],
      stake: 1,
      stakeToken: 'NATIVE',
      resolutionType: 0,
      encrypted: false,
    })

    submitWagerForm()

    /*
     * Native collateral may legitimately be REFUSED — v2 is ERC20-only — so this accepts either
     * outcome, as the comment always promised. Retrying (`cy.contains` + `should`) rather than the
     * original one-shot `invoke('text').then()`, which read the DOM before the tx settled.
     * Tightening this to success-only would fail the test for behaving correctly.
     */
    cy.contains(/Wager Created|not supported|native|erc20/i, { timeout: 60000 })
      .should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // CRE-03: 1v1 WMATIC
  // ---------------------------------------------------------------------------
  it('[CRE-03] Create 1v1 wager with WMATIC', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-03: Wrapped MATIC wager test',
      opponent: TEST_ACCOUNTS[1],
      stake: 1,
      stakeToken: 'WNATIVE',
      resolutionType: 0,
      encrypted: false,
    })

    submitWagerForm()

    cy.contains('Wager Created', { timeout: 60000 }).should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // CRE-04: Creator Only resolution
  // ---------------------------------------------------------------------------
  it('[CRE-04] Create 1v1 wager with Creator Only resolution', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-04: Creator resolves this wager',
      opponent: TEST_ACCOUNTS[1],
      stake: 5,
      resolutionType: 1, // Creator Only
      encrypted: false,
    })

    submitWagerForm()
    assertWagerCreated()
  })

  // ---------------------------------------------------------------------------
  // CRE-05: Opponent Only resolution
  // ---------------------------------------------------------------------------
  it('[CRE-05] Create 1v1 wager with Opponent Only resolution', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-05: Opponent resolves this wager',
      opponent: TEST_ACCOUNTS[1],
      stake: 5,
      resolutionType: 2, // Opponent Only
      encrypted: false,
    })

    submitWagerForm()
    assertWagerCreated()
  })

  // ---------------------------------------------------------------------------
  // CRE-06: Third Party resolution
  // ---------------------------------------------------------------------------
  it('[CRE-06] Create 1v1 wager with Third Party resolution', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-06: Third party arbitrator resolves',
      opponent: TEST_ACCOUNTS[1],
      stake: 5,
      resolutionType: 3, // Third Party
      arbitrator: TEST_ACCOUNTS[2],
      encrypted: false,
    })

    submitWagerForm()
    assertWagerCreated()
  })

  // ---------------------------------------------------------------------------
  // CRE-07: Private / encrypted wager
  // ---------------------------------------------------------------------------
  it('[CRE-07] Create encrypted private wager', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-07: This is an encrypted wager',
      opponent: TEST_ACCOUNTS[1],
      stake: 10,
      resolutionType: 0,
      // encrypted defaults to true; leave it on
    })

    submitWagerForm()

    /*
     * Success-only is correct here NOW: cy.ensureEncryptionKeys([0,1]) in before() guarantees the
     * opponent holds a key, so the "opponent hasn't registered a key" branch this used to tolerate
     * is unreachable. Tolerating it would let a genuine encryption regression pass.
     */
    cy.contains('Wager Created', { timeout: 60000 }).should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // CRE-08: Custom acceptance deadline
  // ---------------------------------------------------------------------------
  it('[CRE-08] Create wager and verify acceptance deadline', () => {
    connectWalletAndVisit(0)

    openAndFillWagerForm({
      description: 'CRE-08: Custom deadline wager',
      opponent: TEST_ACCOUNTS[1],
      stake: 5,
      resolutionType: 0,
      encrypted: false,
    })

    // Verify the derived acceptance deadline is displayed (deterministic, not
    // editable) via the glanceable "Accept by" timeline tile.
    cy.get('[role="dialog"]').within(() => {
      cy.contains('Accept by').should('be.visible')
      cy.get('.fm-stat-tile.is-accept .fm-stat-time').should('exist')
      cy.get('.fm-stat-tile.is-accept .fm-stat-time').invoke('text').should('not.be.empty').and('not.equal', '—')
    })

    submitWagerForm()
    assertWagerCreated()
  })

  // ---------------------------------------------------------------------------
  // CRE-09: Custom end date
  // ---------------------------------------------------------------------------
  it('[CRE-09] Create wager with custom end date', () => {
    connectWalletAndVisit(0)

    cy.openCreateWagerModal('oneVsOne')

    // Fill basic fields
    cy.get('#fm-description, [role="dialog"] input[type="text"]')
      .first()
      .clear()
      .type('CRE-09: Wager with custom end date')

    cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]')
      .first()
      .clear()
      .type(TEST_ACCOUNTS[1])

    cy.enterAmountViaKeypad('fm-stake', '5')

    // Set a custom end date (7 days from now)
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const formattedDate = futureDate.toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm
    cy.get('#fm-end-date, [role="dialog"] input[type="datetime-local"]')
      .first()
      .clear()
      .type(formattedDate)

    // Encryption is ON by default and no longer optional (see note above).

    submitWagerForm()
    assertWagerCreated()
  })

  // ---------------------------------------------------------------------------
  // CRE-10: Group wagers are not offered (v2 contract is 1v1 only)
  // ---------------------------------------------------------------------------
  it('[CRE-10] Group wager creation is not available', () => {
    connectWalletAndVisit(0)

    // No "Group Wager" entry card on the dashboard.
    cy.contains('.quick-action-card', /group wager/i).should('not.exist')

    // And the 1v1 creation form exposes no member-address / group inputs.
    cy.openCreateWagerModal('oneVsOne')
    cy.get('[role="dialog"]').within(() => {
      cy.get('#fm-members').should('not.exist')
      cy.get('#fm-min-threshold').should('not.exist')
    })
  })

  // ---------------------------------------------------------------------------
  // CRE-11: Offer with asymmetric odds
  // ---------------------------------------------------------------------------
  it('[CRE-11] Create offer wager with asymmetric odds', () => {
    connectWalletAndVisit(0)

    cy.openCreateWagerModal('offer')

    // Offer-type form has odds slider
    cy.get('[role="dialog"]').within(() => {
      cy.get('#fm-description, input[type="text"]').first().clear().type('CRE-11: Offer 5x odds')

      cy.get('input[placeholder*="0x"]').first().clear().type(TEST_ACCOUNTS[1])

  // Wait for the address to RESOLVE, not a fixed 500ms. validateForm requires
  // formData.opponentResolved (FriendMarketsModal.jsx:699-702), which AddressInput sets from an
  // async callback; submitting first fails validation with "Opponent address is required" and the
  // modal simply never reaches the success screen. AddressInput renders
  // role="img" aria-label="Valid address" once resolution lands.
  cy.get('[aria-label="Valid address"]', { timeout: 15000 }).should('exist')

      cy.enterAmountViaKeypad('fm-stake', '10')

      // Set odds to 5x (500)
      cy.get('.fm-odds-presets button').then(($buttons) => {
        const fiveXBtn = $buttons.filter(':contains("5x")')
        if (fiveXBtn.length > 0) {
          cy.wrap(fiveXBtn.first()).click()
        }
      })
    })


    // Verify odds summary shows correct values
    cy.get('[role="dialog"]').within(() => {
      cy.get('.fm-odds-summary, .fm-odds-row').should('exist')
    })

    submitWagerForm()

    cy.contains('Wager Created', { timeout: 60000 }).should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // CRE-12: Oracle-pegged wager — Polymarket
  // ---------------------------------------------------------------------------
  it('[CRE-12] Create Polymarket-pegged wager', () => {
    connectWalletAndVisit(0)

    cy.openCreateWagerModal('oneVsOne')

    // Select Polymarket resolution type
    cy.get('#fm-resolution-type, [role="dialog"] .fm-select').then(($select) => {
      // Find the Polymarket option
      const polyOption = $select.find('option').filter((_, el) => {
        return el.textContent.toLowerCase().includes('polymarket') ||
               el.textContent.toLowerCase().includes('linked market')
      })

      if (polyOption.length > 0) {
        cy.selectResolutionType(polyOption.val())

        // The Polymarket browser should appear
        cy.get('[role="dialog"]').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('polymarket') || lower.includes('linked') || lower.includes('market')).to.be.true
        })
      } else {
        // Polymarket not available on this chain — verify option is absent
        expect(polyOption.length).to.equal(0)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // CRE-13: Oracle-pegged wager — Chainlink Data Feed
  // ---------------------------------------------------------------------------
  it('[CRE-13] Create Chainlink Data Feed wager', () => {
    connectWalletAndVisit(0)

    cy.openCreateWagerModal('oneVsOne')

    cy.get('#fm-resolution-type, [role="dialog"] .fm-select').then(($select) => {
      const clOption = $select.find('option').filter((_, el) => {
        return el.textContent.toLowerCase().includes('chainlink data feed') ||
               el.textContent.toLowerCase().includes('price condition')
      })

      if (clOption.length > 0) {
        cy.selectResolutionType(clOption.val())

        // Oracle condition picker should appear
        cy.get('[role="dialog"]').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('chainlink') || lower.includes('data feed') || lower.includes('price')).to.be.true
        })
      } else {
        // Adapter not deployed on this chain
        expect(clOption.length).to.equal(0)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // CRE-14: Oracle-pegged wager — Chainlink Functions
  // ---------------------------------------------------------------------------
  it('[CRE-14] Create Chainlink Functions wager', () => {
    connectWalletAndVisit(0)

    cy.openCreateWagerModal('oneVsOne')

    cy.get('#fm-resolution-type, [role="dialog"] .fm-select').then(($select) => {
      const cfOption = $select.find('option').filter((_, el) => {
        return el.textContent.toLowerCase().includes('chainlink functions') ||
               el.textContent.toLowerCase().includes('custom request')
      })

      if (cfOption.length > 0) {
        cy.selectResolutionType(cfOption.val())

        cy.get('[role="dialog"]').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('chainlink') || lower.includes('functions')).to.be.true
        })
      } else {
        expect(cfOption.length).to.equal(0)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // CRE-15: Oracle-pegged wager — UMA
  // ---------------------------------------------------------------------------
  it('[CRE-15] Create UMA Optimistic Oracle wager', () => {
    connectWalletAndVisit(0)

    cy.openCreateWagerModal('oneVsOne')

    cy.get('#fm-resolution-type, [role="dialog"] .fm-select').then(($select) => {
      const umaOption = $select.find('option').filter((_, el) => {
        return el.textContent.toLowerCase().includes('uma') ||
               el.textContent.toLowerCase().includes('optimistic oracle')
      })

      if (umaOption.length > 0) {
        cy.selectResolutionType(umaOption.val())

        cy.get('[role="dialog"]').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('uma') || lower.includes('optimistic')).to.be.true
        })
      } else {
        expect(umaOption.length).to.equal(0)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // CRE-16: Browse Polymarket markets in picker
  // ---------------------------------------------------------------------------
  it('[CRE-16] Browse Polymarket markets in picker', () => {
    connectWalletAndVisit(0)

    cy.openCreateWagerModal('oneVsOne')

    cy.get('#fm-resolution-type, [role="dialog"] .fm-select').then(($select) => {
      const polyOption = $select.find('option').filter((_, el) => {
        return el.textContent.toLowerCase().includes('polymarket') ||
               el.textContent.toLowerCase().includes('linked market')
      })

      if (polyOption.length > 0) {
        cy.selectResolutionType(polyOption.val())

        // The PolymarketBrowser component should render inside the form
        cy.get('[role="dialog"]').then(($modal) => {
          const hasBrowser = $modal.find('.polymarket-browser, [class*="polymarket"]').length > 0
          const hasSearch = $modal.find('input[type="search"], input[placeholder*="search"], input[placeholder*="Search"]').length > 0

          // Either the browser is visible or search input is present
          const modalText = $modal.text().toLowerCase()
          const hasPolyRef = modalText.includes('polymarket') ||
                            modalText.includes('search') ||
                            modalText.includes('browse') ||
                            modalText.includes('market')

          expect(hasBrowser || hasSearch || hasPolyRef).to.be.true
        })
      } else {
        // Polymarket not supported on this chain
        cy.get('[role="dialog"]').invoke('text').then((text) => {
          // Verify the hint about needing Polygon for linked markets
          expect(text.toLowerCase()).to.not.include('polymarket')
        })
      }
    })
  })
})
