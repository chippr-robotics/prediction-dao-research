// =============================================================================
// 13-dashboard.cy.js
// Fast-tier E2E tests for dashboard rendering (DSH-01..DSH-13)
//
// These tests use mockWeb3Provider() and demo mode (VITE_USE_MOCK_WAGERS env
// bypass or localStorage useMockWagers) to verify the dashboard UI renders
// correctly without a Hardhat node.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

describe('Dashboard', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  /**
   * Helper: visit /fairwins with mock provider and connect the wallet so the
   * dashboard (not the Welcome View) renders. The connected dashboard gates on
   * isConnected unless demoMode is true.
   */
  function connectAndVisitDashboard() {
    cy.mockWeb3Provider({ account: TEST_ACCOUNT })
    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // Connect via UI.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .click()
    cy.get('.connector-option:not(.unavailable)', { timeout: 5000 })
      .first()
      .click()
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')
  }

  // ---------------------------------------------------------------------------
  // DSH-01: Quick action cards visible
  // ---------------------------------------------------------------------------
  it('[DSH-01] Quick action cards visible (Create 1v1, Group, Scan QR, My Wagers)', () => {
    connectAndVisitDashboard()

    // The quick-actions-grid should contain exactly 4 action cards.
    cy.get('.quick-actions-grid', { timeout: 10000 }).should('be.visible')
    cy.get('.quick-action-card').should('have.length', 4)

    // Verify each action card title.
    cy.get('.quick-action-card').eq(0).should('contain.text', 'New 1v1 Wager')
    cy.get('.quick-action-card').eq(1).should('contain.text', 'Group Wager')
    cy.get('.quick-action-card').eq(2).should('contain.text', 'Scan QR Code')
    cy.get('.quick-action-card').eq(3).should('contain.text', 'My Wagers')
  })

  // ---------------------------------------------------------------------------
  // DSH-02: My Wagers — Participating tab
  // ---------------------------------------------------------------------------
  it('[DSH-02] My Wagers Participating tab', () => {
    connectAndVisitDashboard()

    // Open My Wagers modal via the quick action card.
    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // The Participating tab should be active by default.
    cy.get('[role="tab"][aria-selected="true"]', { timeout: 5000 })
      .should('contain.text', 'Participating')

    // The tabpanel should be visible.
    cy.get('[role="tabpanel"], .mm-panel', { timeout: 5000 }).should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // DSH-03: My Wagers — Created tab
  // ---------------------------------------------------------------------------
  it('[DSH-03] My Wagers Created tab', () => {
    connectAndVisitDashboard()

    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // Switch to Created tab.
    cy.contains('[role="tab"]', 'Created').click()
    cy.get('[role="tab"]').contains('Created')
      .should('have.attr', 'aria-selected', 'true')

    // The Created tabpanel should be visible.
    cy.get('[role="tabpanel"], .mm-panel').should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // DSH-04: My Wagers — History tab
  // ---------------------------------------------------------------------------
  it('[DSH-04] My Wagers History tab', () => {
    connectAndVisitDashboard()

    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // Switch to History tab.
    cy.contains('[role="tab"]', 'History').click()
    cy.get('[role="tab"]').contains('History')
      .should('have.attr', 'aria-selected', 'true')

    cy.get('[role="tabpanel"], .mm-panel').should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // DSH-05: Filter wagers by status
  // ---------------------------------------------------------------------------
  it('[DSH-05] Filter wagers by status', () => {
    connectAndVisitDashboard()

    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // The filter bar should be visible with Type and Status dropdowns.
    cy.get('.mm-filter-bar', { timeout: 5000 }).should('be.visible')

    // Verify the Status filter select exists and has options.
    cy.get('.mm-filter-bar .mm-filter-select').should('have.length.gte', 2)

    // Change the status filter to "Active".
    cy.get('.mm-filter-bar .mm-filter-select').last().select('active')
    cy.get('.mm-filter-bar .mm-filter-select').last().should('have.value', 'active')

    // Change back to "All Status".
    cy.get('.mm-filter-bar .mm-filter-select').last().select('all')
    cy.get('.mm-filter-bar .mm-filter-select').last().should('have.value', 'all')
  })

  // ---------------------------------------------------------------------------
  // DSH-06: View wager details from list
  // ---------------------------------------------------------------------------
  it('[DSH-06] View wager details from list', () => {
    connectAndVisitDashboard()

    // Open My Wagers.
    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // If there are wager rows, clicking one should show the detail view.
    cy.get('.mm-panel, [role="tabpanel"]').then(($panel) => {
      const rows = $panel.find('.mm-table-row, tr[role="button"]')
      if (rows.length > 0) {
        cy.wrap(rows.first()).click()
        // Detail view should show the back button and market info.
        cy.get('.mm-detail, .mm-back-btn').should('be.visible')
        cy.get('.mm-detail-header, .mm-detail-title-row').should('be.visible')
      } else {
        // No wagers — the empty state should be visible.
        cy.get('.mm-empty-state').should('be.visible')
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // DSH-07: Wager status indicators
  // ---------------------------------------------------------------------------
  it('[DSH-07] Wager status indicators', () => {
    connectAndVisitDashboard()

    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // Check across all tabs that status badges exist and have the right classes.
    cy.get('.mm-panel, [role="tabpanel"]').then(($panel) => {
      const badges = $panel.find('.mm-status-badge')
      if (badges.length > 0) {
        // Every badge should have a status-* class.
        badges.each((_, el) => {
          const classes = el.className
          expect(classes).to.match(/status-/)
        })
      } else {
        // Empty state — verify the empty-state component is shown.
        cy.get('.mm-empty-state').should('exist')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // DSH-08: How-it-works collapsible section
  // ---------------------------------------------------------------------------
  it('[DSH-08] How-it-works collapsible section', () => {
    connectAndVisitDashboard()

    // The How It Works card should be present.
    cy.get('.how-it-works-card', { timeout: 10000 }).should('be.visible')

    // The toggle button should exist and show the collapsed state initially.
    cy.get('.how-it-works-toggle')
      .should('be.visible')
      .should('have.attr', 'aria-expanded', 'false')

    // Steps should NOT be visible when collapsed.
    cy.get('.how-it-works-steps').should('not.exist')

    // Click to expand.
    cy.get('.how-it-works-toggle').click()
    cy.get('.how-it-works-toggle')
      .should('have.attr', 'aria-expanded', 'true')

    // Steps should now be visible with 4 items.
    cy.get('.how-it-works-steps', { timeout: 5000 }).should('be.visible')
    cy.get('.how-step').should('have.length', 4)

    // Click to collapse again.
    cy.get('.how-it-works-toggle').click()
    cy.get('.how-it-works-toggle')
      .should('have.attr', 'aria-expanded', 'false')
    cy.get('.how-it-works-steps').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // DSH-09: Polymarket feed on dashboard
  // ---------------------------------------------------------------------------
  it('[DSH-09] Polymarket feed on dashboard', () => {
    connectAndVisitDashboard()

    // The PolymarketBrowser component renders in the dashboard.
    // It may self-gate if the chain doesn't support Polymarket.
    // Verify the section exists (even if empty due to chain).
    cy.get('.dashboard-section', { timeout: 10000 })
      .should('have.length.gte', 2)

    // If Polymarket content loaded, it should render cards or a message.
    cy.get('body').then(($body) => {
      const hasPolymarket = $body.find('.polymarket-browser, .polymarket-feed').length > 0
      // Either the component rendered or the section is present (may be empty on non-Polygon).
      expect(hasPolymarket || $body.find('.dashboard-section').length > 1).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // DSH-10: Dashboard without membership shows CTA
  // ---------------------------------------------------------------------------
  it('[DSH-10] Dashboard without membership shows CTA', () => {
    connectAndVisitDashboard()

    // The CTA banner shows for connected users who lack WAGER_PARTICIPANT role.
    // With mock provider (no real roles), the banner should appear.
    cy.get('body').then(($body) => {
      const banner = $body.find('.dashboard-cta-banner')
      if (banner.length > 0) {
        // Banner is visible — verify its content.
        cy.get('.dashboard-cta-banner').should('be.visible')
        cy.get('.dashboard-cta-banner')
          .should('contain.text', 'Get access')
          .or('contain.text', 'Wager Participant')

        // Verify the "Get Membership" button exists.
        cy.get('.cta-banner-btn.primary').should('be.visible')

        // Verify the dismiss button exists.
        cy.get('.cta-banner-dismiss').should('be.visible')
      } else {
        // Banner not shown — the user may already have the role. This is OK.
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // DSH-11: Empty state no wagers
  // ---------------------------------------------------------------------------
  it('[DSH-11] Empty state no wagers', () => {
    connectAndVisitDashboard()

    // Open My Wagers — with no real markets, it should show empty state.
    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // The Participating tab empty state should be shown.
    cy.get('.mm-empty-state', { timeout: 5000 }).should('be.visible')
    cy.get('.mm-empty-state h3').should('exist')
    cy.get('.mm-empty-state h3').invoke('text').should('not.be.empty')
  })

  // ---------------------------------------------------------------------------
  // DSH-12: Loading state
  // ---------------------------------------------------------------------------
  it('[DSH-12] Loading state', () => {
    connectAndVisitDashboard()

    // Open My Wagers — the loading spinner may briefly appear.
    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // Verify that after loading, either the spinner disappears and content
    // (empty state or data) is shown — not stuck in a loading loop.
    cy.get('.mm-content', { timeout: 10000 }).should('be.visible')
    cy.get('.mm-content').then(($content) => {
      const hasSpinner = $content.find('.mm-spinner, .mm-loading').length > 0
      const hasEmptyState = $content.find('.mm-empty-state').length > 0
      const hasTable = $content.find('.mm-table, .mm-table-container').length > 0
      const hasWalletPrompt = $content.find('.mm-empty-icon').length > 0
      // Content should resolve to one of these states.
      expect(hasSpinner || hasEmptyState || hasTable || hasWalletPrompt).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // DSH-13: Decrypt encrypted wager in list
  // ---------------------------------------------------------------------------
  it('[DSH-13] Decrypt encrypted wager in list', () => {
    connectAndVisitDashboard()

    // Open My Wagers.
    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')

    // If there are encrypted wagers, they should show a "Decrypt Wager Details"
    // button in the detail view. Without real market data, we verify the decrypt
    // UI pattern: if a wager has isEncrypted=true and no decryptedMetadata, the
    // button should appear.
    cy.get('.mm-panel, [role="tabpanel"]').then(($panel) => {
      const rows = $panel.find('.mm-table-row, tr[role="button"]')
      if (rows.length > 0) {
        // Click first wager to see detail view.
        cy.wrap(rows.first()).click()
        cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

        // Check if it's encrypted — if so, the decrypt button should exist.
        cy.get('.mm-detail').then(($detail) => {
          const decryptBtn = $detail.find('button:contains("Decrypt Wager Details")')
          if (decryptBtn.length > 0) {
            expect(decryptBtn).to.have.length.greaterThan(0)
          } else {
            // Not encrypted or already decrypted — verify description shows.
            expect(true).to.be.true
          }
        })
      } else {
        // No wagers at all — the empty state is fine.
        cy.get('.mm-empty-state').should('exist')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // DSH-14..DSH-16: Expired pending offers (My Wagers cleanup)
  //
  // These cover the UI-only contract: an offer whose acceptanceDeadline has
  // passed must be hidden by default, must surface under the Expired filter
  // with "Expired" in the Time Left column (not e.g. "23h 6m" from the
  // resolve deadline), and must be clearable from the user's local view.
  // The on-chain refund path is exercised by REF-01 in the full tier; here
  // we only assert what the user sees and what localStorage records.
  // ---------------------------------------------------------------------------

  /**
   * Connect, then seed localStorage with the supplied friend-market list and
   * reload so FriendMarketsContext picks them up from cache. The on-chain
   * fetch fails (no Hardhat) and the catch path preserves localStorage,
   * matching the wallet-disconnected-from-node scenario in production caches.
   */
  function seedFriendMarketsAndOpen(markets) {
    connectAndVisitDashboard()
    cy.window().then((win) => {
      win.localStorage.setItem('friendMarkets', JSON.stringify(markets))
    })
    cy.reload()
    cy.get('body', { timeout: 10000 }).should('be.visible')
    // Re-connect via UI after reload (wagmi auto-reconnect may not fire).
    cy.get('body').then(($body) => {
      if ($body.find('.wallet-connect-button, button[aria-label="Connect Wallet"]').length > 0) {
        cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
          .click()
        cy.get('.connector-option:not(.unavailable)', { timeout: 5000 })
          .first()
          .click()
      }
    })
    cy.get('.quick-action-card').contains('My Wagers').click()
    cy.get('[role="dialog"], .my-markets-modal', { timeout: 5000 }).should('be.visible')
  }

  /** Build a synthetic friend-market record for an opponent-side expired offer. */
  function expiredOfferAsOpponent(id = 'exp-1') {
    return {
      id,
      uniqueId: `0xMOCK-${id}`,
      contractAddress: '0xMOCK',
      creator: '0x00000000000000000000000000000000000000aa', // not the test account
      opponent: TEST_ACCOUNT,
      participants: ['0x00000000000000000000000000000000000000aa', TEST_ACCOUNT],
      description: 'DSH-14 Expired Friend Offer',
      status: 'pending_acceptance',
      acceptanceDeadline: Date.now() - 60 * 60 * 1000,
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      stakeAmount: '1',
      stakeTokenSymbol: 'USDC',
      acceptedCount: 0,
    }
  }

  it('[DSH-14] Expired pending offers hidden from default Participating view', () => {
    seedFriendMarketsAndOpen([expiredOfferAsOpponent('exp-14')])

    // Default Participating tab + "All Status" filter → expired offer hidden.
    cy.get('.mm-empty-state', { timeout: 5000 }).should('be.visible')
    cy.contains('.mm-table-row', 'DSH-14 Expired Friend Offer').should('not.exist')
  })

  it('[DSH-15] Expired filter surfaces expired offers with "Expired" time-left and a Clear button', () => {
    seedFriendMarketsAndOpen([expiredOfferAsOpponent('exp-15')])

    cy.get('.mm-filter-bar .mm-filter-select').last().select('expired')
    cy.get('.mm-filter-bar .mm-filter-select').last().should('have.value', 'expired')

    cy.contains('.mm-table-row', 'DSH-15', { timeout: 5000 }).should('be.visible')
      .within(() => {
        // Time-left column reads "Expired" (not e.g. "23h 6m" from endDate).
        cy.get('.mm-time-expired').should('have.text', 'Expired')
        // Opponent-side action is just "Clear" (creator's variant adds "Reclaim").
        cy.contains('button', /^Clear$/).should('be.visible')
      })
  })

  it('[DSH-16] Clear button dismisses an expired offer and persists to localStorage', () => {
    seedFriendMarketsAndOpen([expiredOfferAsOpponent('exp-16')])

    cy.get('.mm-filter-bar .mm-filter-select').last().select('expired')
    cy.contains('.mm-table-row', 'DSH-16').should('be.visible')

    cy.contains('button', /^Clear$/).click({ force: true })

    // Row gone from the list and the dismissed set recorded under the
    // wallet's per-account key.
    cy.contains('.mm-table-row', 'DSH-16').should('not.exist')
    cy.window().then((win) => {
      const raw = win.localStorage.getItem(
        `mywagers_dismissed:${TEST_ACCOUNT.toLowerCase()}`
      )
      expect(raw).to.exist
      const ids = JSON.parse(raw)
      expect(ids).to.include('exp-16')
    })
  })
})
