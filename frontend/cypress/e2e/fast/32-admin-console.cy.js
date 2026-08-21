// =============================================================================
// 32-admin-console.cy.js
// Fast-tier E2E tests for the operations Control Room (specs 071 + 093).
//
// Issue #1242. The issue proposed the on-chain tier; three of its four flows
// belong here instead, and admission rule 1 is why. What each one turns on is a
// ROLE SWEEP — a set of `hasRole` reads across the cohort — and the states that
// matter most are the ones a healthy chain cannot produce: a chain that will not
// answer, and a chain with nothing deployed to answer with. An unreachable
// network is only reachable-on-demand as a stub; you cannot ask a real node to
// be deterministically down. The fourth flow, the single-chain write, moves a
// killswitch and lives in the on-chain tier (34-admin-single-chain-write).
//
// The sweep is answered at the RPC boundary, per network, with the app's own
// ABI: `hasRole(bytes32,address)` on whichever contract the app resolves for a
// role on that chain. Nothing about the console is mocked.
// =============================================================================

/** Hardhat #0 — no significance here beyond being a well-formed address. */
const OPERATOR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

/**
 * The mainnet cohort, and the host each chain's shipped read provider resolves to.
 *
 * `cohortChainIds()` on a mainnet build is exactly these six. They are spelled out rather than
 * imported because the point of the tests below is what an operator is TOLD about each one by
 * name — "Ethereum could not be read" is the assertion, so the mapping has to be explicit.
 */
const CHAINS = [
  { id: 1, name: 'Ethereum', hosts: ['ethereum-rpc.publicnode.com'] },
  { id: 10, name: 'Optimism', hosts: ['optimism-rpc.publicnode.com'] },
  { id: 61, name: 'Ethereum Classic', hosts: ['etc.rivet.link', 'etc.etcdesktop.com'] },
  { id: 137, name: 'Polygon', hosts: ['polygon-bor-rpc.publicnode.com'] },
  { id: 8453, name: 'Base', hosts: ['base-rpc.publicnode.com'] },
  { id: 42161, name: 'Arbitrum One', hosts: ['arbitrum-one-rpc.publicnode.com'] },
]

/*
 * Role hashes, as the contracts define them. `ADMIN` is DEFAULT_ADMIN_ROLE (zero), which is why
 * a world that grants nothing must still answer `false` rather than an empty result — an
 * unanswered read is a different state from a negative one, and telling them apart is the whole
 * subject of this file.
 */
const ROLE = {
  GUARDIAN: '0x55435dd261a4b9b3364963f7738a7a662ad9c84396d64be3365284bb7f0a5041',
  SANCTIONS_ADMIN: '0x120f974a3b1c46838e58df88a957752089d3bff8b65f144f94c1b4b52c456b72',
}

const HAS_ROLE = '0x91d14854' // hasRole(bytes32,address)
const BOOL_TRUE = `0x${'0'.repeat(63)}1`
const BOOL_FALSE = `0x${'0'.repeat(64)}`

const hostPattern = (host) => new RegExp(host.replace(/\./g, '\\.'))

/**
 * Stand the estate up.
 *
 * @param {object}   world
 * @param {number[]} world.dead   Chains whose RPC answers 503 — i.e. every contract on them
 *                                refuses to be read. Not a socket kill: a clean HTTP failure is
 *                                deterministic and does not leave retries outliving the test
 *                                (the ECONNRESET that took out an earlier fast-tier spec).
 * @param {object}   world.holds  chainId -> role hashes this operator holds there.
 */
function estateWorld({ dead = [], holds = {} } = {}) {
  CHAINS.forEach(({ id, hosts }) => {
    hosts.forEach((host, i) => {
      const alias = `rpc-${id}-${i}`
      if (dead.includes(id)) {
        cy.intercept({ method: 'POST', url: hostPattern(host) }, (req) =>
          req.reply({ statusCode: 503, body: 'upstream unavailable' }),
        ).as(alias)
        return
      }
      const held = new Set(holds[id] || [])
      cy.intercept({ method: 'POST', url: hostPattern(host) }, (req) => {
        const one = ({ method, params, id: rpcId }) => {
          const reply = (result) => ({ jsonrpc: '2.0', id: rpcId, result })
          switch (method) {
            case 'eth_chainId':
              return reply(`0x${id.toString(16)}`)
            case 'net_version':
              return reply(String(id))
            case 'eth_blockNumber':
              return reply('0x4000000')
            case 'eth_getCode':
              return reply('0x60806040')
            case 'eth_call': {
              const data = String(params?.[0]?.data || '')
              if (data.slice(0, 10) !== HAS_ROLE) return reply('0x')
              return reply(held.has(`0x${data.slice(10, 74)}`) ? BOOL_TRUE : BOOL_FALSE)
            }
            default:
              return reply('0x')
          }
        }
        const body = req.body
        req.reply({ statusCode: 200, body: Array.isArray(body) ? body.map(one) : one(body || {}) })
      }).as(alias)
    })
  })
}

/**
 * Connect on Polygon, with the wallet's OWN transport pointed at a host this world covers.
 *
 * `cy.mockWeb3Provider` forwards to `rpcUrl`, which defaults to a local node that is not running
 * in this tier. A wallet that claims 137 while reading from nothing produces failures the test
 * never meant to model.
 */
function enterAsOperator() {
  cy.mockWeb3Provider({
    account: OPERATOR,
    preAuthorized: true,
    networkId: 137,
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
  })
  cy.visit('/admin')
}

const permissionsCard = () =>
  cy.contains('.admin-card', 'Your Permissions').find('.card-info')

describe('Operations Control Room (specs 071 + 093)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[AD-01] admin.control-room-gating — a role held on ONE chain opens exactly the apps it gates', () => {
    /*
     * Entry is an estate-wide question (FR-009): the guardian role is held on Polygon and the
     * console must open on the strength of it. Equally, entry is not authority — the apps other
     * roles gate stay shut, which is the half a "does the panel render" test never checks.
     */
    estateWorld({ holds: { 137: [ROLE.GUARDIAN] } })
    enterAsOperator()

    cy.contains('h1', 'Operations', { timeout: 40000 }).should('be.visible')
    cy.get('.admin-badge').should('have.text', 'Guardian')

    cy.contains('.control-room-tile', 'Incident Response').should('exist')
    cy.contains('.control-room-tile', 'Access Control').should('not.exist')
    cy.contains('.control-room-tile', 'Membership & Revenue').should('not.exist')

    // And the permissions card names WHERE the role was found, not merely that it was.
    cy.contains('.permission-item', 'Guardian').should('have.class', 'enabled').and('contain.text', 'Polygon')
  })

  it('[AD-02] admin.control-room-gating — holding nothing is a denial that says how much it checked', () => {
    /*
     * Every chain answers, and answers no. That is a real denial, and it is allowed to say so —
     * but it still has to account for the estate, because "we asked five networks" and "we asked
     * one" are different levels of confidence in the same sentence.
     */
    estateWorld({})
    enterAsOperator()

    cy.contains('h2', 'Access Restricted', { timeout: 40000 }).should('be.visible')
    cy.contains('.unauthorized-hint', /Checked across 5 networks/).should('exist')
    // Ethereum Classic carries none of the operator contracts — a fact about the address book,
    // reported as such rather than folded into the count of networks that answered.
    cy.contains('.unauthorized-hint', /Ethereum Classic carries no operator contracts/).should('exist')
    cy.contains('h2', 'Could Not Verify Access').should('not.exist')
  })

  it('[AD-03] admin.control-room-gating — when NOTHING could be read, that is not a denial', () => {
    /*
     * THE FR-012 case, and the one that was wrong. Every chain is down. The console used to reach
     * a non-empty `read` list anyway, because a chain carrying none of the operator contracts
     * answers "not held" straight out of the address book — five of the six mainnet chains do
     * that for at least one role. So a total outage rendered "Access Restricted": a statement
     * about the operator's permissions, made without a single successful read, at exactly the
     * moment an incident commander is trying to get in.
     *
     * The distinction is not decoration. One screen says "you don't have this"; the other says
     * "we couldn't ask" and offers a retry.
     */
    estateWorld({ dead: CHAINS.map((c) => c.id) })
    enterAsOperator()

    cy.contains('h2', 'Could Not Verify Access', { timeout: 40000 }).should('be.visible')
    cy.contains('connectivity problem, not a statement about what you hold').should('be.visible')
    cy.contains('button', 'Retry').should('be.visible')
    cy.contains('h2', 'Access Restricted').should('not.exist')
  })

  it('[AD-04] admin.estate-reads-three-state — read, not-deployed and unreadable are three answers', () => {
    /*
     * One chain answers and grants entry (Polygon), one refuses (Ethereum), one has nothing to
     * refuse with (Ethereum Classic). All three have to be visible AS themselves:
     *
     *  - the count covers only what actually answered,
     *  - the chain that refused is NAMED, with what its silence does and does not prove,
     *  - and a tile whose read failed says so rather than rendering the zero it never read.
     *
     * That last one is the "done when" of the issue: an unreachable read must never render as a
     * zero. The Incident Response tile summarises the registry's pause state, and this world
     * answers the role reads while leaving `paused()` unanswered — so the tile has a live
     * estate, a reachable chain, and still no value. "Active on 0 networks" would be a
     * fabrication; "Status could not be read" is the truth.
     */
    estateWorld({ dead: [1], holds: { 137: [ROLE.GUARDIAN] } })
    enterAsOperator()

    cy.contains('h1', 'Operations', { timeout: 40000 }).should('be.visible')

    permissionsCard().should(($p) => {
      const text = $p.text()
      // Polygon, Optimism, Base, Arbitrum One answered. Ethereum did not; ETC had nothing to ask.
      expect(text, 'read count excludes the unreachable and the undeployed').to.match(
        /Read across 4 networks\./,
      )
      expect(text, 'the unreachable chain is named, with what it does not prove').to.match(
        /Ethereum could not be read, so nothing above rules out a role held there/,
      )
      expect(text, 'the chain with no operator contracts is named as that, not as read').to.match(
        /Ethereum Classic carries no operator contracts/,
      )
    })

    cy.contains('.control-room-tile', 'Incident Response')
      .find('.control-room-tile__status')
      .should('have.text', 'Status could not be read')
      .and('not.contain.text', 'Active on 0')
  })

  it('[AD-05] admin.maintenance-permissionless — an operator with an unrelated role still gets Maintenance, plainly', () => {
    /*
     * Maintenance calls are permissionless on-chain, so the console must not gate them behind a
     * role — but it must also not imply they confer status. Both halves are asserted: the tile is
     * offered to an operator whose only role is compliance, and it is rendered PLAIN while the
     * tile their role actually unlocks is not.
     *
     * The badge is the other half of "no elevated status": inside the app they are still a
     * Compliance Officer, not an Administrator.
     */
    estateWorld({ holds: { 137: [ROLE.SANCTIONS_ADMIN] } })
    enterAsOperator()

    cy.contains('h1', 'Operations', { timeout: 40000 }).should('be.visible')
    cy.contains('.control-room-tile', 'Compliance')
      .should('exist')
      .and('not.have.class', 'control-room-tile--plain')
    cy.contains('.control-room-tile', 'Maintenance').should('have.class', 'control-room-tile--plain')
    cy.contains('.control-room-tile', 'Access Control').should('not.exist')

    cy.contains('.control-room-tile', 'Maintenance').click()
    cy.location('pathname').should('eq', '/admin/maintenance')
    cy.contains('h1', 'Maintenance', { timeout: 20000 }).should('be.visible')
    cy.contains('permissionless on-chain').should('be.visible')
    cy.get('.admin-badge').should('have.text', 'Compliance Officer')
  })
})
