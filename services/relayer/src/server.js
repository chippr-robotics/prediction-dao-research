/**
 * FairWins ZK-Wager Pool gas relayer — HTTP entrypoint.
 *
 * GAS INFRASTRUCTURE, NOT AN APP BACKEND. This service exists solely to pay gas for members' pre-signed
 * EIP-3009 pool joins. It is stateless, holds a gas-only key, and stores no user/business data. See
 * README.md "No-backend footprint note" for the standing-directive tension this introduces.
 *
 * Endpoints:
 *   GET  /healthz            — liveness + enabled chains (no secrets)
 *   POST /relay/pool-join    — { chainId, pool, identityCommitment, authorization } -> { txHash }
 */
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { loadConfig } from './config.js'
import { buildChains } from './chains.js'
import { parseRequest, relayPoolJoin, RelayError } from './relay.js'

/**
 * Build the Express app. Exported so it can be exercised by integration tests / supertest without
 * binding a port. Chains are injectable for testing.
 * @param {ReturnType<typeof loadConfig>} config
 * @param {Record<number, object>} [chains]
 */
export function createApp(config, chains = buildChains(config)) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  // Small body limit: the payload is a fixed-shape JSON object; nothing large is ever legitimate.
  app.use(express.json({ limit: '8kb' }))

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'fairwins-pool-relayer', enabledChainIds: config.enabledChainIds })
  })

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'too many relay requests' } },
  })

  app.post('/relay/pool-join', limiter, async (req, res) => {
    try {
      const reqData = parseRequest(req.body)
      const handle = chains[reqData.chainId]
      if (!handle) {
        throw new RelayError(400, 'chain_not_enabled', `chainId ${reqData.chainId} is not enabled on this relayer`)
      }
      const result = await relayPoolJoin(handle, reqData, {
        requireSanctionsScreen: config.requireSanctionsScreen,
        txConfirmations: config.txConfirmations,
      })
      res.json(result)
    } catch (err) {
      if (err instanceof RelayError) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } })
        return
      }
      // Never leak internals / stack to clients; log server-side.
      // eslint-disable-next-line no-console
      console.error('[relayer] unexpected error', err)
      res.status(500).json({ error: { code: 'internal', message: 'internal error' } })
    }
  })

  // JSON parse errors etc.
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'too_large', message: 'request body too large' } })
      return
    }
    res.status(400).json({ error: { code: 'bad_request', message: 'invalid request' } })
  })

  return app
}

// Boot only when run directly (not when imported by tests).
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const config = loadConfig()
  const app = createApp(config)
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[relayer] listening on :${config.port} | chains=${config.enabledChainIds.join(',')} | ` +
        `screening=${config.requireSanctionsScreen} | rate=${config.rateLimit.max}/${config.rateLimit.windowMs}ms`
    )
  })
}
