/**
 * E2E Tests: the mini-app platform (specs 073 / 077 / 028 / 030, Full-tier)
 *
 * Issue #1238. The Apps section executes UNTRUSTED THIRD-PARTY CODE, and the rules that make
 * that safe are the kind a refactor inverts without breaking a single unit test:
 *
 *   MA-01  miniapp.launch-verified-package        bytes are verified against the chain before they run
 *   MA-02  miniapp.launchable-not-status          a live app whose update is in review still launches
 *   MA-03  miniapp.curator-approve-content-committed  an approval is refused when the package changed
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
const REVIEW_URL = '/admin/compliance?view=miniapp-review'

/**
 * The fixture package's bytes, fetched through a task because the fixtures module is Node-side
 * (`node:fs`) — and because bytes are what has to cross, not a parsed object.
 */
const packageBytes = (variant) => cy.task('miniappPackage', { variant })

/**
 * A REAL first-party package (`token-mint`, `clearpath`), as `publish:local:miniapps` staged it.
 *
 * The three flows above run against the committed FIXTURE package, whose whole job is to be small
 * enough to reason about. Token Mint and ClearPath are the two packages members actually launch,
 * they carry `wallet:submit` and a `contracts` allowlist the fixture does not, and every claim
 * about what a package may do is a claim about THEM. Nothing here is synthesized: the bytes come
 * out of the same preset and the same `publish.js` pipeline that pins a released package.
 */
const realPackage = (app) =>
  cy.task('miniappRealPackage', { app }).then((r) => {
    expect(r.ok, `miniappRealPackage ${app}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

const sanctions = (action, args = {}) =>
  cy.task('sanctionsFixture', { action, args }).then((r) => {
    expect(r.ok, `sanctionsFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

const actor = (action, args = {}) =>
  cy.task('appActorFixture', { action, args }).then((r) => {
    expect(r.ok, `appActorFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

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
const serveFiles = ({ cid, files }) => {
  for (const [path, text] of Object.entries(files)) {
    // `body` is the file's exact text. Anything that re-encodes it — base64, a JSON body —
    // changes the bytes, and the loader refuses them as an integrity failure, which is the
    // right answer to the wrong question.
    cy.intercept('GET', `${GATEWAY}/ipfs/${cid}/${path}`, (req) => {
      req.reply({ statusCode: 200, body: text, headers: { 'content-type': 'text/plain' } })
    })
  }
}

const servePackage = (variant) => packageBytes(variant).then(serveFiles)

/**
 * Put a real package on the chain and on the gateway, and hand back what was published.
 *
 * The listing NAME matters: `registryClient#appSlug(record.name)` is passed to the loader as the
 * id it expects, and the loader compares it to the `id` inside the authenticated manifest. So the
 * name a curator lists cannot be chosen freely here — "Token Mint" folds to `token-mint`, which is
 * what the package claims to be, and anything else refuses at launch rather than at listing.
 */
const publishReal = (app) =>
  realPackage(app).then((pkg) => {
    serveFiles(pkg)
    return registry('ensureServing', { name: pkg.name, cid: pkg.cid, manifestHash: pkg.manifestHash }).then(
      (record) => {
        expect(record.launchable, `${pkg.name} is serving`).to.equal(true)
        expect(record.approved.manifestHash, 'and it is the package just built').to.equal(pkg.manifestHash)
        return { ...pkg, record }
      },
    )
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

  /*
   * The deny list is chain state on an account every test in this file shares, so restoring it
   * cannot live at the end of the test that sets it: MA-05 failing anywhere before its last line
   * left the member restricted, and the next run's very first `grantMembership` reverted — five
   * failures whose message said nothing about sanctions. Cleanup that only runs on success is not
   * cleanup. The task is idempotent, so this costs nothing on the tests that never touched it.
   */
  afterEach(() => {
    cy.task('sanctionsFixture', {
      action: 'setDenied',
      args: { address: MEMBER, denied: false, reason: 'e2e: afterEach restore' },
    })
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

  it('[MA-03] miniapp.curator-approve-content-committed — an approval is refused when the package changed under it', () => {
    /*
     * `approveApp(id, expectedManifestHash)` has no id-only overload, deliberately: reading the
     * proposed tuple at EXECUTION time let a vendor swap the package after review and have the
     * curator's signature land on something nobody read. This flow is that attack.
     *
     * The swap has to happen while the review page is OPEN and must not be followed by a refresh —
     * a reloaded page would pick up the new hash and approve it quite correctly. What is under
     * test is the commitment the curator's client made when they decided, not the chain's ability
     * to compare two numbers.
     */
    packageBytes('approved').then(({ cid, manifestHash }) => {
      registry('ensureServing', { name: APP_NAME, cid, manifestHash }).then(({ id }) => {
        // The vendor proposes something. Its CID is deliberately one the gateway does not serve,
        // so the curator's verification fails and they have to acknowledge that before approving —
        // which is exactly the circumstance in which content-commitment earns its keep.
        const reviewed = `0x${'11'.repeat(32)}`
        registry('submitUpdate', { id, cid: 'bafybeireviewedpackage073t014exampleaaaaaaaaaaaaaaaaaa', manifestHash: reviewed })

        cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
        cy.visit(REVIEW_URL)
        cy.contains('h3', 'Mini-app review', { timeout: 40000 }).should('be.visible')
        cy.contains('.miniapp-review-record', APP_NAME, { timeout: 30000 }).as('record')

        // The curator reviews: verification cannot fetch the package, so they take it on
        // themselves in as many words.
        cy.get('@record').contains('button', /Verify proposed package/i).click()
        cy.get('@record').find('label.checkbox-label input[type="checkbox"]', { timeout: 40000 })
          .check()
        cy.get('@record').contains('button', /^Approve v/).should('not.be.disabled')

        // ── The swap. The page is not reloaded; the curator is still looking at v2. ──────
        const swapped = `0x${'22'.repeat(32)}`
        registry('submitUpdate', { id, cid: 'bafybeiswappedpackage073t014examplebbbbbbbbbbbbbbbbbbb', manifestHash: swapped })
          .then((app) => {
            expect(app.proposed.manifestHash, 'the chain now holds the swapped package').to.equal(swapped)
          })

        cy.get('@record').contains('button', /^Approve v/).click()

        /*
         * Refused, and the refusal NAMES what happened rather than reporting a failed transaction:
         * the curator has to learn the package MOVED, not merely that their click did not work.
         *
         * Asserted on the toast without a wait first, because this notice is transient — and
         * because the console re-reads the record straight afterwards and re-arms Approve on the
         * NEW proposal, which is correct behaviour and would erase any later evidence.
         */
        // Scoped to the notification itself. `cy.assertToast` matches any `[role="alert"]`, and the
        // record already carries one — the verification-failure panel this flow deliberately
        // provoked — so the generic helper reads the wrong element.
        /*
         * The curator is TOLD, and the approval does not go through.
         *
         * Deliberately not asserting the specific `StaleProposal` wording that
         * `MiniAppReviewTab#decodeStaleProposal` composes ("the vendor replaced this package since
         * you opened it…"). That message needs ethers to have decoded the revert into
         * `error.revert`, and through the injected-wallet path it arrives as raw `error.data`
         * instead, so what actually renders here is the generic "execution reverted". Whether a
         * real wallet fares better is not something this harness can settle, so the flow asserts
         * the refusal it can prove rather than a sentence it cannot. Tracked in #1267.
         */
        cy.get('.notification-message', { timeout: 30000 })
          .invoke('text')
          .should('match', /revert|failed|error/i)

        // The durable proof, from the chain: the swap was never promoted, and the package members
        // are being served is the one approved long before any of this.
        registry('appState', { id }).then((app) => {
          expect(app.proposed.manifestHash, 'the swap was not promoted').to.equal(swapped)
          expect(app.approved.manifestHash, 'and the served package is untouched').to.equal(manifestHash)
          expect(app.launchable, 'members are unaffected throughout').to.equal(true)
        })
      })
    })
  })

  it('[MA-04] miniapp.token-mint-deploy — a package deploys a real contract through the host, and only through the host', () => {
    /*
     * Token Mint (spec 028) is a converted mini-app: the same issuance surface that used to be
     * host code now ships as third-party-shaped bytes behind an on-chain commitment. What has to
     * still be true afterwards is that it can do the ONE privileged thing it exists for — put a
     * contract on chain — and that it does it through `host.wallet.submit` rather than through a
     * signer of its own, because a package has no signer and must never acquire one.
     *
     * The proof is taken from the chain, not from the app's own success panel: `tokenCount` on the
     * factory the HOST resolved, before and after.
     */
    const SYMBOL = `E2E${Date.now().toString().slice(-6)}`

    publishReal('token-mint').then((pkg) => {
      expect(pkg.permissions, 'the package asks the host for a write').to.include('wallet:submit')
      expect(pkg.contracts, 'and declares the one contract it may resolve').to.deep.equal(['tokenFactory'])

      actor('tokenCount', { issuer: MEMBER }).then(({ total: before }) => {
        cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
        cy.visit('/apps/token-mint')
        cy.get('.miniapp-workspace-root', { timeout: 60000 }).should('exist')
        cy.get('.miniapp-workspace-refusal').should('not.exist')

        // The create form is the package's own DOM, rendered inside the host's workspace. The app
        // opens on "My Tokens"; issuance lives behind its own tab.
        cy.contains('.tm-tab', 'Create', { timeout: 30000 }).click()
        cy.get('#tk-name', { timeout: 30000 }).should('be.visible').clear().type('E2E Coverage Token')
        cy.get('#tk-symbol').clear().type(SYMBOL)
        cy.get('#tk-supply').clear().type('1000')

        // `canIssue` is a real read of TOKEN_ISSUER_ROLE against the factory — if the button is
        // disabled the member genuinely is not authorized, which is a different failure than a
        // broken flow, so it is asserted separately.
        cy.contains('button', /Review & deploy/i).should('not.be.disabled').click()

        // The app waits for CONFIRMATION before it claims anything (`submit` resolves at
        // broadcast), so this line is the app agreeing with the chain rather than guessing.
        cy.contains('.tm-success', /created and confirmed on-chain/i, { timeout: 90000 }).should('be.visible')

        actor('tokenCount', { issuer: MEMBER }).then(({ total: after, byIssuer }) => {
          expect(after, 'the factory recorded exactly one new token').to.equal(before + 1)
          expect(byIssuer, 'and it is attributed to the member who signed').to.have.length.greaterThan(0)
        })
      })
    })
  })

  it('[MA-05] miniapp.host-submit-screens — sanctions screening happens INSIDE submit, not in the app', () => {
    /*
     * The host screens the acting account inside `wallet.submit`, before either write rail is
     * touched. That placement is the whole control: an app-side pre-check is something a package
     * can simply not write, and the packages most worth screening are the least likely to
     * cooperate. This flow measures the placement — same package, same form, same button, one
     * on-chain deny-list entry — and it is worth measuring precisely because nothing in the
     * package changes, so no test inside the package could ever catch its removal.
     *
     * The deny-list write is real (`SanctionsGuard.setDenied`), because `useAddressScreening`
     * reads that contract. Nothing about screening is stubbed.
     */
    const SYMBOL = `BLK${Date.now().toString().slice(-6)}`

    publishReal('token-mint').then(() => {
      actor('tokenCount', { issuer: MEMBER }).then(({ total: before }) => {
        sanctions('setDenied', { address: MEMBER, denied: true, reason: 'e2e: host-submit-screens' }).then((s) => {
          expect(s.denied, 'the chain now denies the member').to.equal(true)
        })

        cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
        cy.visit('/apps/token-mint')
        cy.get('.miniapp-workspace-root', { timeout: 60000 }).should('exist')

        cy.contains('.tm-tab', 'Create', { timeout: 30000 }).click()
        cy.get('#tk-name', { timeout: 30000 }).should('be.visible').clear().type('Refused Token')
        cy.get('#tk-symbol').clear().type(SYMBOL)
        cy.get('#tk-supply').clear().type('1000')
        cy.contains('button', /Review & deploy/i).should('not.be.disabled').click()

        /*
         * The refusal is the HOST's, surfaced through the package's own error notification —
         * which is the honest shape: the app is told it may not send, and says so, without
         * having had to ask.
         */
        cy.get('.notification-message', { timeout: 60000 })
          .invoke('text')
          .should('match', /restricted|sanction/i)

        cy.contains('.tm-success', /created and confirmed on-chain/i).should('not.exist')

        // Nothing reached a rail. The count is the durable proof; the toast is not.
        actor('tokenCount', { issuer: MEMBER }).then(({ total: after }) => {
          expect(after, 'no transaction was sent').to.equal(before)
        })

        // Put the member back. Every later test in this file shares this account, and a wallet
        // left restricted would fail them for a reason none of them is about.
        sanctions('setDenied', { address: MEMBER, denied: false, reason: 'e2e: cleanup' }).then((s) => {
          expect(s.allowed, 'the member is unrestricted again').to.equal(true)
        })
      })
    })
  })


  it('[MA-06] miniapp.clearpath-create-dao — ClearPath registers an external DAO on chain, through the host', () => {
    /*
     * SCOPE, STATED HONESTLY. This flow is filed against spec 030, whose pillar A is native
     * standard DAOs — creating one. That pillar has no member surface at all: the ClearPath
     * package ships Register and Track and nothing that deploys a Governor (OZ 5.4.0's
     * GovernorUpgradeable pulls in the Cancun `mcopy` opcode and is not deployable on the
     * pre-Cancun chains this platform targets, so the contract side was deferred too). Testing
     * what ships is the only option that measures anything; the gap is tracked separately rather
     * than papered over with a flow id that promises creation.
     *
     * What ships IS a value-bearing member action: registering writes to the on-chain
     * ExternalDAORegistry, behind a real Silver membership gate and a real `_isGovernor` probe,
     * through the same `host.wallet.submit` a package has no way around.
     */
    const LABEL = `E2E DAO ${Date.now().toString().slice(-6)}`

    publishReal('clearpath').then((pkg) => {
      expect(pkg.contracts, 'the package declares the registry it resolves').to.include('externalDAORegistry')

      // Silver is the registry's own floor. Granting it is arranging an authorization the member
      // genuinely needs — the gate is not bypassed, it is satisfied.
      actor('grantDaoTier', { address: MEMBER })

      // A FRESH Governor each run: registration is permanent (there is no unregister), so reusing
      // one would make this flow pass exactly once against any given node.
      actor('deployGovernor').then(({ address: governor }) => {
        expect(governor, 'a Governor stand-in was deployed for this run').to.match(/^0x[0-9a-fA-F]{40}$/)

        actor('daoRegistry', { dao: governor, registrant: MEMBER }).then(({ registered }) => {
          expect(registered, 'nothing has registered this DAO yet').to.equal(false)

          cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
          cy.visit('/apps/clearpath')
          cy.get('.miniapp-workspace-root', { timeout: 60000 }).should('exist')
          cy.get('.miniapp-workspace-refusal').should('not.exist')

          cy.contains('.cp-tab', /Register \/ Track/i, { timeout: 30000 }).click()

          // The connected chain carries a registry, so the action really is "Register DAO" — the
          // heading says so, and that wording is the app telling the truth about what the button
          // will do (on a registry-less network the same surface says "Track DAO" and writes
          // nothing on chain).
          cy.contains('h4', /Register an external DAO/i, { timeout: 20000 }).should('be.visible')

          cy.get('#cp-dao-addr').clear().type(governor)
          cy.contains('button', /^Validate$/).click()

          // Validation is a real read against the target chain's own RPC: the app recognises a
          // Governor or it does not, and a wrong answer here would be the app's, not the fixture's.
          cy.get('.cp-ok', { timeout: 30000 }).should('contain.text', 'Recognized')

          cy.get('#cp-dao-label').clear().type(LABEL)
          cy.contains('button', /^Register DAO$/).should('not.be.disabled').click()

          cy.get('.notification-message', { timeout: 90000 })
            .invoke('text')
            .should('match', new RegExp(`Registered ${LABEL}`, 'i'))

          // The durable proof: the registry itself, and the entry attributed to the signer.
          actor('daoRegistry', { dao: governor, registrant: MEMBER }).then((r) => {
            expect(r.registered, 'the DAO is registered on chain').to.equal(true)
            expect(r.byRegistrant, 'and recorded against the member who signed').to.have.length.greaterThan(0)
          })
        })
      })
    })
  })

  it('[MA-07] miniapp.clearpath-network-switch — a registry write on another chain demands the switch instead of signing on the wrong one', () => {
    /*
     * ClearPath READS every chain in the cohort over that chain's own RPC — no switch needed, and
     * that is deliberate: a member should be able to look at a DAO anywhere. Registering is
     * different, because a signer can only sign for the chain it is connected to. So the same
     * surface has to offer two different things depending on the target, and the dangerous
     * inversion is the silent one: offering "Register DAO" for a chain the wallet is not on, and
     * producing a signature that lands somewhere nobody chose.
     *
     * The app must therefore refuse to offer the action and ask for the switch instead. That
     * decision is `needsSwitch` — a registry EXISTS on the target and it is NOT the connected
     * chain — and it is made in the package, using only what the host told it about the cohort.
     */
    publishReal('clearpath').then(() => {
      cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
      cy.visit('/apps/clearpath')
      cy.get('.miniapp-workspace-root', { timeout: 60000 }).should('exist')
      cy.contains('.cp-tab', /Register \/ Track/i, { timeout: 30000 }).click()

      // The network selector lists what the PACKAGE decided it can operate on, from
      // `host.networks()` — the host publishes the cohort, not a per-app capability flag.
      cy.get('#cp-dao-network', { timeout: 20000 }).find('option').should('have.length.greaterThan', 1)

      // On the connected chain the write is offered outright.
      cy.contains('button', /^Register DAO$|^Track DAO$/).should('exist')

      /*
       * Move the target to a chain that is NOT the connected one but DOES carry a registry. Taken
       * from the rendered options rather than hardcoded, so this keeps measuring the rule and not
       * a chain id: the connected chain is the local node, and any other option with a registry
       * will do.
       */
      cy.get('#cp-dao-network').find('option').then(($opts) => {
        const others = [...$opts].map((o) => Number(o.value)).filter((id) => id !== 80002)
        expect(others, 'the cohort offers a second network to target').to.have.length.greaterThan(0)
        cy.get('#cp-dao-network').select(String(others[0]))
      })

      // The write is no longer on offer. What replaces it names the network and says why.
      cy.contains('button', /^Register DAO$/).should('not.exist')
      cy.contains('button', /Switch to .* to register/i).should('be.visible')
    })
  })

})
