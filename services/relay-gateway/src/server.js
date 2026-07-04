/**
 * FairWins relay gateway — HTTP entrypoint (spec 036).
 *
 * The policy front-end for gasless intent submission: recovers + screens the SIGNER, validates
 * intent binding, dedups, rate-limits and fee-gates, then hands built calldata to the OSS
 * submission engine (OpenZeppelin Relayer) which owns nonces/gas/inclusion. Untrusted-by-design:
 * this service can censor, never steal — every response leaves self-submit available (FR-002/FR-003).
 *
 * Routes (contracts/relay-gateway-api.md — implemented faithfully):
 *   POST /v1/intents          submit a signed intent           (origin-locked)
 *   GET  /v1/intents/:id      honest status                    (origin-locked)
 *   POST /v1/engine/webhook   engine status callback           (shared-secret)
 *   GET  /healthz             liveness/readiness               (origin-lock EXEMPT)
 */
import crypto from 'node:crypto'
import express from 'express'
import helmet from 'helmet'
import { loadConfig } from './config/index.js'
import { buildProviders } from './config/providers.js'
import { parseIntent, verifyIntent } from './intent/verify.js'
import { createIntentStore } from './intent/store.js'
import { createSanctionsScreen } from './policy/sanctions.js'
import { createDedupStore } from './policy/dedup.js'
import { createQuotas, createSpendTracker } from './policy/quotas.js'
import { createBackpressure } from './policy/backpressure.js'
import { createKillSwitch } from './policy/killswitch.js'
import { createEngineClient } from './engine/client.js'
import { applyEngineEvent } from './engine/webhook.js'
import { createAuditLogger } from './audit/log.js'
import { GatewayError, EngineUnavailableError } from './errors.js'

/** Constant-time secret comparison over fixed-length digests (no length leak). */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const da = crypto.createHash('sha256').update(a).digest()
  const db = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(da, db)
}

/** Estimated gas cost in wei for spend-cap + fee-netting checks. Estimation failures fall back
 * to configured defaults — the ENGINE owns real pricing; this is a policy-side bound only. */
async function estimateCostWei(provider, chainCfg, { to, data }, defaultGasLimit) {
  let gasLimit = defaultGasLimit
  try {
    if (provider?.estimateGas) gasLimit = BigInt(await provider.estimateGas({ to, data }))
  } catch {
    /* keep fallback */
  }
  let gasPrice = chainCfg.gasPriceFallbackWei
  try {
    if (provider?.getFeeData) {
      const fee = await provider.getFeeData()
      // Legacy chains (61/63) price on gasPrice only; EIP-1559 chains use maxFeePerGas.
      const p = chainCfg.gasType === 'legacy' ? fee?.gasPrice : (fee?.maxFeePerGas ?? fee?.gasPrice)
      if (p != null) gasPrice = BigInt(p)
    }
  } catch {
    /* keep fallback */
  }
  return gasLimit * gasPrice
}

/**
 * Build the Express app. All collaborators are injectable for tests
 * ({providers, engineClient, now, killSwitch, auditSink}).
 *
 * @param {ReturnType<typeof loadConfig>} config
 * @param {{
 *   providers?: Record<number, object>,
 *   engineClient?: {submitTransaction: Function},
 *   now?: () => number,            // unix seconds
 *   killSwitch?: ReturnType<typeof createKillSwitch>,
 *   auditSink?: (line: string) => void,
 * }} [deps]
 */
export function createApp(config, deps = {}) {
  const providers = deps.providers ?? buildProviders(config)
  const engineClient = deps.engineClient ?? createEngineClient(config.engine)
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000))
  const killSwitch = deps.killSwitch ?? createKillSwitch(config.killSwitch)
  const audit = createAuditLogger(deps.auditSink ? { sink: deps.auditSink } : {})

  const nowMs = () => now() * 1000
  const store = createIntentStore({ now: nowMs })
  const dedup = createDedupStore({ now: nowMs })
  const quotas = createQuotas({
    signerPerWindow: config.quotas.signerPerWindow,
    globalPerWindow: config.quotas.globalPerWindow,
    windowMs: config.quotas.windowMs,
    now: nowMs,
  })
  const spend = createSpendTracker({ chains: config.chains, windowMs: config.spendWindowMs, now: nowMs })
  const backpressure = createBackpressure({
    maxQueueDepth: config.maxQueueDepth,
    // The current request's own record is already in the store when this runs — exclude it,
    // the bound applies to work ALREADY in flight (FR-009).
    depthFn: () => Math.max(0, store.inFlightCount() - 1),
  })
  const screen = createSanctionsScreen({ providers, chains: config.chains })

  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(express.json({ limit: '32kb' })) // intents are small fixed-shape JSON; nothing large is legitimate

  // ---- Origin-lock middleware (FR-029, SC-016): client-facing routes require X-Origin-Auth.
  // The Cloudflare Transform Rule injects the header zone-wide; a direct *.run.app hit lacks it.
  // Exempt: /healthz (probes) and /v1/engine/webhook — the engine calls from inside the private
  // network (not through the edge) and authenticates with its own timing-safe shared secret.
  app.use((req, res, next) => {
    if (req.path === '/healthz' || req.path === '/v1/engine/webhook') return next()
    if (!config.originAuthSecret) return next() // dev only; loudly warned at boot
    const header = req.get('x-origin-auth')
    if (!header || !timingSafeEqual(header, config.originAuthSecret)) {
      res.status(403).json({ error: { code: 'origin_denied', reason: 'request did not arrive through the platform edge' } })
      return
    }
    next()
  })

  // ---- GET /healthz (origin-lock exempt) --------------------------------------------------
  app.get('/healthz', async (_req, res) => {
    const chains = {}
    await Promise.all(
      config.enabledChainIds.map(async (chainId) => {
        const chainCfg = config.chains[chainId]
        const provider = providers[chainId]
        let rpc = 'down'
        try {
          await provider.getBlockNumber()
          rpc = 'up'
        } catch {
          rpc = 'down'
        }
        let gasWalletRunwayHrs = null
        if (chainCfg.gasWallet && rpc === 'up') {
          try {
            const balance = BigInt(await provider.getBalance(chainCfg.gasWallet))
            gasWalletRunwayHrs = Number(balance / chainCfg.peakBurnWeiPerHour)
          } catch {
            gasWalletRunwayHrs = null
          }
        }
        chains[chainId] = { rpc, gasWalletRunwayHrs }
      })
    )
    res.json({ status: 'ok', chains, killSwitch: killSwitch.isActive() })
  })

  // ---- POST /v1/intents --------------------------------------------------------------------
  app.post('/v1/intents', async (req, res) => {
    let reserved = null // {chainId, marker} released on any post-reservation rejection
    try {
      // Kill switch first: when active the gateway cleanly stops ACCEPTING intents (FR-015).
      if (killSwitch.isActive()) {
        throw new GatewayError(503, 'killswitch_active', 'relaying is temporarily disabled; use self-submit')
      }

      const intent = parseIntent(req.body)

      // Chain active + matches config (FR-024).
      const chainCfg = config.chains[intent.chainId]
      if (!chainCfg) {
        throw new GatewayError(400, 'chain_mismatch', `chainId ${intent.chainId} is not an active configured network`)
      }

      // Payment class on a chain without EIP-3009 (ETC/Mordor: USC is permit-only).
      if (intent.intentClass === 'payment' && !chainCfg.paymentSupported) {
        throw new GatewayError(
          503,
          'payment_unsupported_on_chain',
          'gasless payment is not available on this network (token lacks EIP-3009); use self-submit'
        )
      }

      // Allow-list -> signer recovery (ECDSA, then ERC-1271 for contract accounts) ->
      // param binding -> validity window -> calldata.
      const { signer, calldata } = await verifyIntent(intent, chainCfg, config, now(), providers[intent.chainId])

      // Dedup by uniquenessMarker (FR-008): completed -> 200 original result; in-flight -> 409.
      const existing = dedup.check(intent.chainId, intent.uniquenessMarker)
      if (existing.state === 'completed') {
        const original = store.get(existing.intentId)
        res.status(200).json({
          intentId: existing.intentId,
          status: 'confirmed',
          ...(original?.txHash ? { txHash: original.txHash } : {}),
        })
        return
      }
      if (existing.state === 'inflight') {
        throw new GatewayError(409, 'duplicate_in_flight', 'an identical intent is already being relayed')
      }

      // Reserve the marker so concurrent duplicates coalesce from here on.
      const record = store.create({
        chainId: intent.chainId,
        signer,
        action: intent.action,
        targetContract: intent.targetContract,
        uniquenessMarker: intent.uniquenessMarker,
      })
      const reservation = dedup.reserve(intent.chainId, intent.uniquenessMarker, record.intentId)
      if (!reservation.ok) {
        store.remove(record.intentId)
        if (reservation.state === 'completed') {
          const original = store.get(reservation.intentId)
          res.status(200).json({
            intentId: reservation.intentId,
            status: 'confirmed',
            ...(original?.txHash ? { txHash: original.txHash } : {}),
          })
          return
        }
        throw new GatewayError(409, 'duplicate_in_flight', 'an identical intent is already being relayed')
      }
      reserved = { chainId: intent.chainId, marker: intent.uniquenessMarker, intentId: record.intentId }

      // Sanctions re-screen of the RECOVERED signer — fail-closed (FR-013).
      await screen.screen(intent.chainId, signer)

      // Per-signer + global quotas (FR-014).
      const q = quotas.hit(signer)
      if (!q.allowed) {
        throw new GatewayError(429, 'quota_exceeded', `${q.scope} relay quota exceeded; retry later or self-submit`, {
          retryAfterSec: q.retryAfterSec,
        })
      }

      // Bounded queue back-pressure (FR-009).
      const bp = backpressure.check()
      if (!bp.allowed) {
        throw new GatewayError(429, 'backpressure', 'relayer is at capacity; retry later or self-submit', {
          retryAfterSec: bp.retryAfterSec,
        })
      }

      // Per-chain per-window gas spend cap (FR-014/FR-018) + fee-netted decline (FR-023).
      const estimatedCostWei = await estimateCostWei(
        providers[intent.chainId],
        chainCfg,
        { to: intent.targetContract, data: calldata },
        config.defaultGasLimit
      )
      const fundingMode = intent.fundingMode ?? chainCfg.fundingMode
      if (fundingMode === 'fee-netted') {
        if (intent.maxFee == null || estimatedCostWei > intent.maxFee) {
          throw new GatewayError(
            402,
            'fee_exceeds_cap',
            `estimated gas cost ${estimatedCostWei} exceeds the intent's maxFee; no funds moved`
          )
        }
      }
      const sp = spend.tryAdd(intent.chainId, estimatedCostWei)
      if (!sp.allowed) {
        throw new GatewayError(429, 'quota_exceeded', 'per-chain gas spend cap reached for this window; retry later or self-submit', {
          retryAfterSec: sp.retryAfterSec,
        })
      }

      // Hand the built call to the engine (contracts/engine-integration.md).
      let engineTx
      try {
        engineTx = await engineClient.submitTransaction({
          relayerId: chainCfg.engineRelayerId,
          to: intent.targetContract,
          data: calldata,
        })
      } catch (e) {
        if (e instanceof EngineUnavailableError) {
          throw new GatewayError(503, 'chain_unavailable', 'submission engine unavailable; use self-submit')
        }
        throw e
      }

      store.attachEngineTx(record.intentId, engineTx.id, engineTx.hash)
      const status = engineTx.hash ? 'submitted' : 'queued'
      reserved = null // submission handed off; marker stays reserved until a terminal webhook

      audit({
        signer,
        chainId: intent.chainId,
        action: intent.action,
        targetContract: intent.targetContract,
        uniquenessMarker: intent.uniquenessMarker,
        txHash: engineTx.hash ?? null,
        outcome: status === 'submitted' ? 'submitted' : 'accepted',
      })

      res.status(202).json({
        intentId: record.intentId,
        status,
        ...(engineTx.hash ? { txHash: engineTx.hash } : {}),
      })
    } catch (err) {
      if (reserved) {
        dedup.release(reserved.chainId, reserved.marker)
        store.remove(reserved.intentId)
      }
      if (err instanceof GatewayError) {
        // Terminal rejection -> audit record (FR-021): every outcome is reviewable.
        const body = req.body ?? {}
        audit({
          // signer is omitted when rejection happened before recovery — never trust a client-asserted one
          chainId: typeof body.chainId === 'number' ? body.chainId : undefined,
          action: typeof body.action === 'string' ? body.action : undefined,
          targetContract: typeof body.targetContract === 'string' ? body.targetContract : undefined,
          uniquenessMarker: typeof body.uniquenessMarker === 'string' ? body.uniquenessMarker : undefined,
          outcome: `rejected(${err.code})`,
        })
        if (err.retryAfterSec != null) res.set('Retry-After', String(err.retryAfterSec))
        res.status(err.status).json(err.toBody())
        return
      }
      console.error('[relay-gateway] unexpected error', err) // never leak internals to clients
      res.status(500).json({ error: { code: 'internal', reason: 'internal error' } })
    }
  })

  // ---- GET /v1/intents/:id -------------------------------------------------------------------
  app.get('/v1/intents/:id', (req, res) => {
    const rec = store.get(req.params.id)
    if (!rec) {
      res.status(404).json({ error: { code: 'not_found', reason: 'unknown intentId' } })
      return
    }
    res.json({
      intentId: rec.intentId,
      status: rec.status,
      ...(rec.txHash ? { txHash: rec.txHash } : {}),
      ...(rec.reason ? { reason: rec.reason } : {}),
    })
  })

  // ---- POST /v1/engine/webhook ----------------------------------------------------------------
  app.post('/v1/engine/webhook', (req, res) => {
    // Shared-secret auth, timing-safe. Fail closed: no configured secret => nothing is accepted.
    const presented = req.get('x-webhook-secret') ?? (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!config.webhookSecret || !presented || !timingSafeEqual(presented, config.webhookSecret)) {
      res.status(403).json({ error: { code: 'origin_denied', reason: 'invalid webhook credentials' } })
      return
    }
    const result = applyEngineEvent({ store, dedup, audit }, req.body ?? {})
    if (!result.ok) {
      const status = result.code === 'unknown_transaction' ? 404 : 400
      res.status(status).json({ error: { code: result.code, reason: 'webhook event not applicable' } })
      return
    }
    res.json({ ok: true })
  })

  // JSON parse errors and other middleware failures.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'too_large', reason: 'request body too large' } })
      return
    }
    res.status(400).json({ error: { code: 'bad_request', reason: 'invalid request body' } })
  })

  return { app, killSwitch, store, dedup }
}

// ---- boot (only when run directly; tests import createApp) -----------------------------------
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  let config
  try {
    config = loadConfig() // throws on any deployments-pin inconsistency (FR-025) -> non-zero exit
  } catch (e) {
    console.error(String(e?.message ?? e))
    process.exit(1)
  }
  if (!config.originAuthSecret) {
    console.warn('[relay-gateway] WARN: ORIGIN_AUTH_SECRET unset — origin lock DISABLED (dev only; SC-016)')
  }
  if (!config.webhookSecret) {
    console.warn('[relay-gateway] WARN: WEBHOOK_SHARED_SECRET unset — engine webhooks will be REJECTED')
  }
  const { app, killSwitch } = createApp(config)
  // Runtime kill switch: `kill -USR2 <pid>` toggles accept/refuse (FR-015).
  process.on('SIGUSR2', () => {
    const active = killSwitch.toggle()
    console.warn(`[relay-gateway] kill switch ${active ? 'ACTIVATED' : 'cleared'} via SIGUSR2`)
  })
  app.listen(config.port, () => {
    console.log(
      `[relay-gateway] listening on :${config.port} | chains=${config.enabledChainIds.join(',')} | ` +
        `killSwitch=${killSwitch.isActive()} | originLock=${Boolean(config.originAuthSecret)}`
    )
  })
}
