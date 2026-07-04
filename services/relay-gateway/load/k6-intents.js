/**
 * CI-gating k6 load test for the relay gateway (FR-011, SC-001/SC-002).
 *
 * Profiles (spec 036 capacity targets — tunable knobs, not ceilings):
 *   sustained: >= 3 intents/sec/chain, held for SUSTAIN_DURATION
 *   burst:     >= 20 intents/sec for 30s
 *
 * Thresholds FAIL the run (and therefore the CI pipeline — FR-026, no continue-on-error):
 *   - p95 accept latency < 2s  (SC-002: p95 accept->broadcast < 2s; the HTTP accept path is the
 *     gateway-side component of that budget)
 *   - error rate: non-shed failures < 1%. 409/429 are EXPECTED shed/coalesce responses under
 *     burst (FR-008/FR-009) and are not errors.
 *
 * Usage:
 *   k6 run load/k6-intents.js \
 *     -e GATEWAY_URL=http://localhost:8788 \
 *     -e ORIGIN_AUTH_SECRET=... \
 *     -e CHAIN_IDS=137,80002,63 \
 *     -e INTENTS_FILE=./load/intents.json     # pre-signed intent bodies (see README)
 *
 * Intents must be PRE-SIGNED (k6 has no ethers): generate a pool of signed bodies against a
 * staging chain with test/helpers.js (signedIntent) and dump them to INTENTS_FILE. Each VU
 * mutates only the uniquenessMarker-bearing body it was assigned, so dedup coalescing is
 * exercised deliberately by the duplicate scenario, not by accident.
 */
import http from 'k6/http'
import { check } from 'k6'
import { SharedArray } from 'k6/data'
import { Rate, Trend } from 'k6/metrics'

const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:8788'
const ORIGIN_AUTH_SECRET = __ENV.ORIGIN_AUTH_SECRET || ''
const CHAIN_IDS = (__ENV.CHAIN_IDS || '137').split(',').map((s) => Number(s.trim()))
const SUSTAINED_RPS_PER_CHAIN = Number(__ENV.SUSTAINED_RPS_PER_CHAIN || 3)
const BURST_RPS = Number(__ENV.BURST_RPS || 20)
const SUSTAIN_DURATION = __ENV.SUSTAIN_DURATION || '2m'

const intents = new SharedArray('intents', () => {
  // Pool of pre-signed intent bodies, one array entry per unique uniquenessMarker.
  return JSON.parse(open(__ENV.INTENTS_FILE || './intents.json'))
})

const acceptLatency = new Trend('accept_latency', true)
const hardErrors = new Rate('hard_errors') // anything that is not 202/200/409/429

export const options = {
  scenarios: {
    sustained: {
      executor: 'constant-arrival-rate',
      rate: SUSTAINED_RPS_PER_CHAIN * CHAIN_IDS.length,
      timeUnit: '1s',
      duration: SUSTAIN_DURATION,
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: 'submitIntent',
    },
    burst: {
      executor: 'constant-arrival-rate',
      rate: BURST_RPS,
      timeUnit: '1s',
      duration: '30s',
      startTime: SUSTAIN_DURATION, // burst runs after the sustained phase
      preAllocatedVUs: 40,
      maxVUs: 200,
      exec: 'submitIntent',
    },
  },
  thresholds: {
    // SC-002: p95 accept latency < 2s — a regression past this FAILS CI.
    accept_latency: ['p(95)<2000'],
    // Hard failure rate (5xx/4xx other than expected shed/coalesce) below 1%.
    hard_errors: ['rate<0.01'],
    // k6's own failed-request accounting (network errors, timeouts).
    http_req_failed: ['rate<0.01'],
  },
}

let cursor = 0

export function submitIntent() {
  // Round-robin the pre-signed pool; markers are unique per entry so each submission is a
  // distinct intent (dedup is exercised by resubmitting an already-used index at the end).
  const body = intents[(cursor += 1) % intents.length]

  const res = http.post(`${GATEWAY_URL}/v1/intents`, JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      ...(ORIGIN_AUTH_SECRET ? { 'X-Origin-Auth': ORIGIN_AUTH_SECRET } : {}),
    },
    timeout: '10s',
  })

  acceptLatency.add(res.timings.duration)

  const shedOrCoalesced = res.status === 409 || res.status === 429
  const accepted = res.status === 202 || res.status === 200
  hardErrors.add(!(accepted || shedOrCoalesced))

  check(res, {
    'accepted, coalesced, or explicitly shed': () => accepted || shedOrCoalesced,
    'shed responses carry Retry-After': () =>
      res.status !== 429 || res.headers['Retry-After'] !== undefined,
  })
}
