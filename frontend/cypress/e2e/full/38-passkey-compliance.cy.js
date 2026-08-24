/**
 * Compliance parity for passkey accounts — the halves that need a chain (spec 041 US6, #1228).
 *
 * The claim behind `compliance.passkey-account-parity` is that the gates a classic wallet meets
 * are the same gates a passkey account meets. Two of them are enforced against chain state and so
 * belong here: sanctions screening (SanctionsGuard) and the membership gate (MembershipManager).
 * The entry gate needs no chain and stays in the no-chain tier (`passkey/compliance.cy.js`).
 *
 * Signing in needs no bundler, no EntryPoint and no factory — a WebAuthn ceremony plus a local
 * address derivation (`smartAccount.deriveAddress` is chain-independent by construction, and
 * `useConnectorAvailability` deliberately does not gate sign-in on submission support). That is
 * why these can run against the ordinary on-chain tier rather than the full passkey stack.
 *
 * Checklist: CP-02..CP-03
 */
import {
  addVirtualAuthenticator as addAuthenticator,
  choosePasskey,
  connectedAddress,
  expectConnected,
  isChromium,
  resetAuthenticators,
} from '../../support/webauthn'

const OPPONENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // hardhat #1

/*
 * The create path's PRE-SUBMISSION verdict. Screening is enforced by the SanctionsGuard inside the
 * registry call, so a denied account fails SIMULATION — before anything is signed or submitted —
 * and the modal states that the transaction will fail.
 *
 * The wording IS matchable now. #1292 is fixed: the registry's custom error is decoded on this
 * path and `translateRevert` names it, so a screened member is told they were screened instead of
 * reading "execution reverted (unknown custom error)". This spec asserts that sentence, which is
 * what the issue asked for once the defect was closed.
 *
 * A fragment rather than the whole sentence, and deliberately not imported from
 * `useFriendMarketCreation`: a Cypress spec cannot import that module (its transitive
 * `virtual:tenant` import has no resolver in the preprocessor — see `commands.js`'s WAGERS_PATH
 * note). The EXACT sentence is pinned as a unit, against the selector the deployed guard really
 * reverts with, in `src/test/useFriendMarketCreation.translateRevert.test.js`. This end of it only
 * has to prove the member reaches the screening message rather than the generic fallback.
 */
// The copy says screening "did not clear" the account rather than that the account is flagged:
// the guard is fail-closed (an oracle outage reverts too), so "flagged" would assert something
// the revert does not establish — see lib/wagers/sanctionsRevert.js.
const SCREENED = /sanctions screening did not clear/i
const MEMBERSHIP = /membership|upgrade|purchase|wager participant/i

;(isChromium ? describe : describe.skip)('Compliance parity for passkey accounts — on chain (spec 041)', () => {
  before(() => {
    /*
     * The opponent needs a registered encryption key or the create is refused for THAT, which is
     * not the refusal under test. Registered through the fixture rather than `ensureEncryptionKeys`
     * on purpose: that command drives the UI, which connects the injected mock and leaves an
     * authorized session behind — and the mock then auto-reconnects over the passkey sign-in, so
     * the session under test never happens. `registerKey` is self-callable on the contract.
     */
    cy.task('chainTx', { action: 'registerKey', args: { index: 1 } }).then((r) => {
      expect(r.ok, 'the opponent has an encryption key').to.equal(true)
    })
  })

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    cy.interceptIpfs()
    resetAuthenticators()
    /*
     * PRF ON. Encryption is mandatory on the create path, and a passkey account derives its
     * encryption key from the authenticator's PRF extension — so a virtual authenticator without
     * it makes the modal say "Encrypted features are unavailable: this passkey/authenticator does
     * not support deterministic key material (PRF)" and refuse. That is a real refusal, but of the
     * device, not of the member: it would have made CP-02 pass while proving nothing about
     * screening. The helper defaults `prf` to false, which is right for the specs that test the
     * degradation itself (FR-012) and wrong here.
     */
    addAuthenticator({ prf: true })
  })

  /** Sign in with a passkey and yield the derived account address. */
  function signInWithPasskey() {
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    choosePasskey()
    expectConnected()
    return connectedAddress()
  }

  // ---------------------------------------------------------------------------
  // CP-02 — a flagged passkey ACCOUNT is refused, and the flag is what refuses it
  // ---------------------------------------------------------------------------
  it('[CP-02] compliance.passkey-account-parity — a flagged passkey account is refused, and unflagging it lifts the refusal', () => {
    signInWithPasskey().as('acct').then((address) => {
      /*
       * MEMBERSHIP FIRST, THEN THE FLAG.
       *
       * A fresh passkey account holds no membership, so an unmembered one is refused by the
       * membership gate — and a test that only asserted "the create was refused" would pass
       * whether or not screening works at all. Granting membership removes that explanation.
       */
      cy.task('chainTx', { action: 'grantMembership', args: { address, tier: 1, durationDays: 30 } })
        .then((r) => expect(r.ok, 'membership granted, so it cannot explain the refusal').to.equal(true))
      cy.task('chainTx', { action: 'fund', args: { address } })
      cy.task('sanctionsFixture', { action: 'setDenied', args: { address, denied: true } })
        .then((r) => {
          expect(r.ok, r.error || 'the flag was applied').to.equal(true)
          expect(r.denied, 'the account is denied on chain').to.equal(true)
        })
    })

    cy.task('lastWagerId').then((before) => {
      cy.visitWagers()
      cy.attemptCreateWager({ opponent: OPPONENT, stake: 2 })

      // Refused before anything is submitted — the guard fails the simulation — and the member is
      // told WHY. Asserting the screening sentence rather than a generic failure is the difference
      // between "something went wrong" and a disclosure the member can act on (#1292).
      cy.get('body', { timeout: 60000 }).should(($b) => {
        expect($b.text(), 'the member is told they were screened, not just that it failed').to.match(SCREENED)
      })

      /*
       * And judged on chain: no wager exists. A dialog saying "will fail" over a wager that was
       * nevertheless created would be the worst of both, and only the registry can say.
       */
      cy.task('lastWagerId').should((after) => {
        expect(after, 'no wager was created for a flagged account').to.equal(before)
      })
    })

    /*
     * THE CONTROL, and the reason this test discriminates at all.
     *
     * Everything above is also true of an account that simply cannot submit — a passkey session on
     * a chain with no bundler is refused too, just later. Lifting ONLY the flag and showing the
     * pre-submission refusal disappear is what attributes it to screening: nothing else about the
     * account, the chain, or the form changed.
     */
    cy.get('@acct').then((address) => {
      cy.task('sanctionsFixture', { action: 'setDenied', args: { address, denied: false } })
        .then((r) => expect(r.allowed, 'the flag is lifted').to.equal(true))
    })
    cy.reload()
    cy.visitWagers()
    cy.attemptCreateWager({ opponent: OPPONENT, stake: 2 })
    cy.get('body', { timeout: 60000 }).should(($b) => {
      expect($b.text(), 'with the flag lifted the screening refusal is gone').to.not.match(SCREENED)
    })
  })

  // ---------------------------------------------------------------------------
  // CP-03 — a role-less passkey account meets the membership gate, with its upgrade path
  // ---------------------------------------------------------------------------
  it('[CP-03] compliance.passkey-account-parity — a role-less passkey account is refused with the upgrade path', () => {
    /*
     * The mirror of CP-02: this account is NOT flagged and holds NO membership, so the only gate
     * left is membership. Together the two prove the gates are told apart rather than that some
     * refusal happens — which a single test could not establish.
     */
    signInWithPasskey().then((address) => {
      cy.task('sanctionsFixture', { action: 'status', args: { address } }).then((r) => {
        expect(r.allowed, 'this account is NOT flagged, so screening cannot explain the refusal').to.equal(true)
      })
      cy.task('chainTx', { action: 'fund', args: { address } })
    })

    cy.task('lastWagerId').then((before) => {
      cy.visitWagers()

      // The gate is disclosed before anything is composed, with the way out named.
      cy.get('body', { timeout: 40000 }).should(($b) => {
        expect($b.text(), 'the membership gate is stated with its upgrade path').to.match(MEMBERSHIP)
      })

      cy.attemptCreateWager({ opponent: OPPONENT, stake: 2 })
      cy.task('lastWagerId').should((after) => {
        expect(after, 'no wager was created without a membership').to.equal(before)
      })
    })
  })
})
