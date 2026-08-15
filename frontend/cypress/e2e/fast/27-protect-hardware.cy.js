// =============================================================================
// 27-protect-hardware.cy.js
// Fast-tier E2E tests for Protect ▸ hardware wallet cold storage (spec 087).
//
// Runs WITHOUT a Hardhat node and WITHOUT hardware: the dev-build-only adapter
// seam (window.__fwHardwareTestAdapter__, adapters.js) stands in for the device.
// The seam exists only when import.meta.env.DEV is true — i.e. on the dev
// server these specs run against — and is dead-code-eliminated from production
// bundles, so nothing tested here relies on shipped mock behavior. Real-device
// behavior is validated in staging per
// docs/runbooks/hardware-wallet-staging-validation.md.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

// Deterministic fake device: address per derivation index, stable across pages.
const HW_ADDRESSES = Array.from({ length: 10 }, (_, i) =>
  `0x${(i + 1).toString(16).padStart(2, '0')}${'ab'.repeat(19)}`,
)

/** Plant the DEV-only adapter seam before the app boots. */
function planted(win) {
  win.__fwHardwareTestAdapter__ = () => ({
    vendor: 'ledger',
    getAddress: (path) => {
      const m = path.match(/(\d+)'?\/0\/0$|0'\/0\/(\d+)$/)
      const idx = Number(m ? m[1] ?? m[2] : 0)
      return Promise.resolve({ address: HW_ADDRESSES[idx] || HW_ADDRESSES[0] })
    },
    getAddresses(paths) {
      return Promise.all(paths.map((p) => this.getAddress(p)))
        .then((r) => r.map((x, i) => ({ path: paths[i], address: x.address })))
    },
    signPersonalMessage: () => Promise.reject(new Error('not exercised here')),
    signTransaction: () => Promise.reject(new Error('not exercised here')),
    close: () => Promise.resolve(),
  })
}

const openProtect = (hash = '') => {
  cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
  cy.visit(`/wallet?tab=custody${hash}`, { onBeforeLoad: planted })
  cy.get('.custody-panel', { timeout: 15000 }).should('be.visible')
}

describe('Protect — hardware wallet cold storage (spec 087)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // HW-01: the Protect page is an exclusive accordion, On chain open by default
  // ---------------------------------------------------------------------------
  it('[HW-01] Protect renders as an accordion: On chain open, one section at a time', () => {
    openProtect()
    cy.get('[data-testid="custody-acc-onchain"] .acc__trigger').should('have.attr', 'aria-expanded', 'true')
    cy.get('[data-testid="custody-acc-offchain"] .acc__trigger').should('have.attr', 'aria-expanded', 'false')
    // The retired placeholder copy is gone for good.
    cy.contains(/coming later/i).should('not.exist')

    cy.get('[data-testid="custody-acc-offchain"] .acc__trigger').click()
    cy.get('[data-testid="custody-acc-offchain"] .acc__trigger').should('have.attr', 'aria-expanded', 'true')
    cy.get('[data-testid="custody-acc-onchain"] .acc__trigger').should('have.attr', 'aria-expanded', 'false')
  })

  // ---------------------------------------------------------------------------
  // HW-02: deep link lands with the Off chain card open (drawer-search contract)
  // ---------------------------------------------------------------------------
  it('[HW-02] #custody-offchain deep link opens the Off chain section', () => {
    openProtect('#custody-offchain')
    cy.get('[data-testid="custody-acc-offchain"] .acc__trigger').should('have.attr', 'aria-expanded', 'true')
  })

  // ---------------------------------------------------------------------------
  // HW-03: the guided add flow, end to end, and app-wide surfacing
  // ---------------------------------------------------------------------------
  it('[HW-03] guided add flow saves an account that persists and reaches the switcher', () => {
    openProtect('#custody-offchain')

    cy.get('[data-testid="hw-add"]').click()
    cy.get('[data-testid="hw-step-vendor"]').should('be.visible')
    cy.get('[data-testid="hw-vendor-ledger"]').click()

    cy.get('[data-testid="hw-step-connect"]').should('be.visible')
    cy.get('[data-testid="hw-connect"]').click()

    // Picker: five derived accounts from the fake device.
    cy.get('[data-testid="hw-step-pick"]').should('be.visible')
    cy.get('.hw-account-row').should('have.length', 5)
    cy.get('.hw-account-row').first().find('input[type="checkbox"]').check()
    cy.get('input[placeholder="e.g. Cold storage"]').type('E2E cold storage')
    cy.get('[data-testid="hw-save"]').click()

    cy.get('[data-testid="hw-step-saved"]').should('be.visible')
    cy.get('[data-testid="hw-done"]').click()

    // Listed in Off chain with label + vendor badge, and the summary counts it.
    cy.get('.hw-list__row').should('have.length', 1).and('contain.text', 'E2E cold storage')
    cy.get('.hw-vendor-badge').should('contain.text', 'Ledger')

    // Survives a reload (the store is persisted per-account).
    cy.visit('/wallet?tab=custody#custody-offchain', { onBeforeLoad: planted })
    cy.get('.hw-list__row', { timeout: 15000 }).should('have.length', 1)

    // App-wide: the account switcher offers it, tagged as Hardware. The switcher list sits
    // behind the identity caret inside the wallet dropdown (the identity IS the switcher).
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]').click()
    cy.get('.account-identity-trigger').click()
    cy.contains('.account-switch-tag', 'Hardware').should('exist')
  })

  // ---------------------------------------------------------------------------
  // HW-04: forgetting is confirmed, and states funds stay with the device
  // ---------------------------------------------------------------------------
  it('[HW-04] forget flow requires confirmation and empties the list', () => {
    openProtect('#custody-offchain')
    cy.get('[data-testid="hw-add"]').click()
    cy.get('[data-testid="hw-vendor-ledger"]').click()
    cy.get('[data-testid="hw-connect"]').click()
    cy.get('.hw-account-row').first().find('input[type="checkbox"]').check()
    cy.get('[data-testid="hw-save"]').click()
    cy.get('[data-testid="hw-done"]').click()

    cy.get('.hw-list__remove').click()
    cy.contains(/device keeps controlling the funds/i).should('be.visible')
    cy.get('.hw-list__confirm-yes').click()
    cy.contains(/no hardware accounts yet/i).should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // HW-05: without the seam, the real vendor gate answers honestly (FR-003).
  // Headless Chromium HAS WebHID, so Ledger stays offered; the point is that the
  // wizard's vendor step renders real availability, not a dead control.
  // ---------------------------------------------------------------------------
  it('[HW-05] vendor step shows real availability without the test seam', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
    cy.visit('/wallet?tab=custody#custody-offchain')
    cy.get('[data-testid="hw-add"]', { timeout: 15000 }).click()
    cy.get('[data-testid="hw-vendor-ledger"]').should('exist')
    cy.get('[data-testid="hw-vendor-trezor"]').should('exist')
    // Every vendor option carries a stated hint — the transport it will use when available
    // (headless Chromium has WebHID, so both are offered here), or the refusal reason when not.
    // Either way the member is never shown a bare dead control (FR-003).
    cy.get('.hw-vendor-option .hw-vendor-option__hint').each(($hint) => {
      expect($hint.text().trim().length).to.be.greaterThan(10)
    })
  })
})
