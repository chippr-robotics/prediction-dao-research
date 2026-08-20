/**
 * E2E Tests: the mini-app platform (specs 073 / 077 / 028 / 030, Full-tier)
 *
 * Issue #1238. The Apps section executes UNTRUSTED THIRD-PARTY CODE, and the rules that make
 * that safe are the kind a refactor inverts without breaking a single unit test:
 *
 *   MA-01  miniapp.launch-verified-package   bytes are verified against the chain before they run
 *   MA-02  miniapp.launchable-not-status     a live app whose update is in review still launches
 *
 * ── WHY THIS NEEDS A CHAIN IT CAN WRITE TO ────────────────────────────────────────────────
 * Every one of these claims is about the relationship between a package and an on-chain record,
 * and half of them require CHANGING that record mid-flow — proposing an update, swapping a
 * package under a curator. Mordor is a public network; none of that is possible there. The
 * DEV-only `E2E_AMOY_LOCAL` branch in `miniAppChainId()` puts the registry on the local node so
 * these can be arranged, and `networks.miniapps.test.js` fences it out of a shipped build.
 *
 * ── WHAT IS STUBBED, AND WHY IT DOES NOT WEAKEN THE ASSERTION ─────────────────────────────
 * Only the GATEWAY TRANSPORT. There is no IPFS on this machine, so `cy.intercept` answers the
 * `/ipfs/<cid>/<path>` fetches the loader itself issues, with the bytes of the package fixture
 * committed at `src/test/miniapps/fixtures/package/`.
 *
 * The verification stays entirely real, and that is the point: the loader still takes keccak256
 * of the manifest bytes it received and compares it to the hash THE CHAIN holds, then sha256 of
 * every file against that authenticated manifest. Stubbing the transport changes who hands over
 * the bytes, not whether they are allowed to run — which is why MA-01 can serve the committed
 * TAMPERED bytes and watch the same pipeline refuse them.
 */

const MEMBER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0 — deployer, curator, and vendor

/** Folds to the `fixture-app` id the fixture manifest claims (registryClient#appSlug). */
const APP_NAME = 'Fixture App'
const APP_SLUG = 'fixture-app'

/** Must match VITE_MINIAPP_GATEWAY in frontend/package.json's dev:e2e. */
const GATEWAY = 'http://localhost:8090'

const CATALOG_URL = '/wallet?tab=apps'

/**
 * The fixture package's bytes, fetched through a task because the fixtures module is Node-side
 * (`node:fs`) — and because bytes are what has to cross, not a parsed object.
 */
const packageBytes = (variant) => cy.task('miniappPackage', { variant })

const registry = (action, args = {}) =>
  cy.task('miniappFixture', { action, args }).then((r) => {
    expect(r.ok, `miniappFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

/**
 * Answer the loader's own gateway fetches with `files`, a { path: Uint8Array } map.
 *
 * Deliberately serves BYTES rather than a parsed body: the manifest is hashed before it is
 * parsed (FR-011), so a stub that replied with an object would skip the very step under test.
 */
const servePackage = (variant) =>
  packageBytes(variant).then(({ cid, files }) => {
    for (const [path, text] of Object.entries(files)) {
      // `body` is the file's exact text. Anything that re-encodes it — base64, a JSON body —
      // changes the bytes, and the loader refuses them as an integrity failure, which is the
      // right answer to the wrong question.
      cy.intercept('GET', `${GATEWAY}/ipfs/${cid}/${path}`, (req) => {
        req.reply({ statusCode: 200, body: text, headers: { 'content-type': 'text/plain' } })
      })
    }
  })

const openCatalog = () => {
  cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
  cy.visit(CATALOG_URL)
  cy.get('.miniapp-catalog', { timeout: 40000 }).should('exist')
}

describe('Mini-app platform (specs 073 / 077 / 028 / 030)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[MA-01] miniapp.launch-verified-package — the bytes are checked against the chain, and tampered bytes never run', () => {
    packageBytes('approved').then(({ cid, manifestHash }) => {
      registry('ensureServing', { name: APP_NAME, cid, manifestHash }).then((app) => {
        expect(app.launchable, 'the record is serving a package').to.equal(true)
        expect(app.approved.manifestHash, 'and it is the fixture we published').to.equal(manifestHash)

        // ── The honest path: the package the chain approved is the package that runs. ──
        servePackage('approved')
        openCatalog()
        cy.contains('.miniapp-row', APP_NAME, { timeout: 30000 }).find('.miniapp-row-tap').click()
        cy.get('.miniapp-sheet[role="dialog"]', { timeout: 20000 }).should('be.visible')
        cy.get('.miniapp-sheet-open').should('have.attr', 'href', `/apps/${APP_SLUG}`).click()

        cy.get('.miniapp-workspace-root', { timeout: 40000 }).should('exist')
        cy.get('.miniapp-workspace-refusal').should('not.exist')

        // ── The same pipeline, one byte different. ──────────────────────────────────────
        // The chain still holds the hash of the APPROVED manifest, so serving the committed
        // tampered bytes is exactly the supply-chain attack the verification exists to stop.
        servePackage('tampered')
        cy.visit(`/apps/${APP_SLUG}`)
        cy.get('.miniapp-workspace-refusal', { timeout: 40000 })
          .should('have.attr', 'data-refusal', 'integrity')
        cy.get('.miniapp-workspace-root').should('not.exist')
      })
    })
  })

  it('[MA-02] miniapp.launchable-not-status — a live app whose update is in review still launches', () => {
    /*
     * `launchable` is the serving decision, NEVER `status`. A vendor who submits an update puts
     * their own record back to Pending while the last APPROVED package keeps serving — so a host
     * that gated on `status === Approved` would let any vendor take their own live app offline by
     * submitting anything at all. That is the inversion this flow exists to catch.
     */
    packageBytes('approved').then(({ cid, manifestHash }) => {
      registry('ensureServing', { name: APP_NAME, cid, manifestHash }).then(({ id }) => {
        // The vendor proposes something new. Nothing about the served package changed.
        registry('submitUpdate', {
          id,
          cid: 'bafybeifixtureminiapppackage073t014exampleupdatebbbbbbbb',
          manifestHash: `0x${'ab'.repeat(32)}`,
        }).then((app) => {
          expect(app.status, 'the record is back in review').to.equal(0) // Pending
          expect(app.launchable, 'and it is STILL serving members').to.equal(true)
          expect(app.approved.manifestHash, 'the approved tuple is untouched').to.equal(manifestHash)
        })

        // The member's experience is unchanged: it launches, and it runs the approved bytes.
        servePackage('approved')
        cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
        cy.visit(`/apps/${APP_SLUG}`)
        cy.get('.miniapp-workspace-root', { timeout: 40000 }).should('exist')
        cy.get('.miniapp-workspace-refusal').should('not.exist')
      })
    })
  })
})
