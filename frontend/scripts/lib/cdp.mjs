/**
 * A minimal Chrome DevTools Protocol client for design screenshots.
 *
 * Deliberately dependency-free. Playwright is not in this workspace, and adding
 * it — or running any incremental `npm install` to get it — risks the optional
 * platform binaries this repo has had silently dropped (npm/cli#4828, see
 * scripts/deps/reinstall.sh). The environment already ships Chromium, and Node
 * 22 ships a WebSocket client, so a screenshot needs neither.
 *
 * Dev-only: nothing in the app or its tests imports this.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const BROWSER_ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'

/** Locate the pre-installed Chromium without assuming its version directory. */
export function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH
  if (!existsSync(BROWSER_ROOT)) throw new Error(`No browser root at ${BROWSER_ROOT}`)
  const dirs = readdirSync(BROWSER_ROOT)
    .filter((d) => d.startsWith('chromium'))
    // Prefer the full browser over the headless shell: the shell cannot capture
    // beyond the viewport, which is exactly what a full-page shot needs.
    .sort((a, b) => (a.includes('headless') ? 1 : 0) - (b.includes('headless') ? 1 : 0))
  for (const dir of dirs) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const path = join(BROWSER_ROOT, dir, rel)
      if (existsSync(path)) return path
    }
  }
  throw new Error(`No chromium binary under ${BROWSER_ROOT}`)
}

/** Launch headless Chromium and return a connected client. */
export async function launch({ args = [] } = {}) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'cdp-'))
  const child = spawn(findChromium(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    ...args,
  ])

  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(
      () => reject(new Error(`Chromium did not report a DevTools endpoint:\n${buffer}`)),
      30000,
    )
    child.stderr.on('data', (chunk) => {
      buffer += chunk
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Chromium exited with ${code}:\n${buffer}`))
    })
  })

  const socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP socket failed to open')), { once: true })
  })

  let nextId = 1
  const pending = new Map()
  const listeners = new Set()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
      return
    }
    for (const listener of [...listeners]) listener(message)
  })

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  const on = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    send,
    on,

    /** Open a page target with its own viewport and return a page handle. */
    async newPage({ width, height, deviceScaleFactor = 2, mobile = false }) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
      const call = (method, params) => send(method, params, sessionId)

      await call('Page.enable')
      await call('Runtime.enable')
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor,
        mobile,
        screenWidth: width,
        screenHeight: height,
      })

      // Anything the page reports as broken. Collected rather than thrown so a
      // screenshot run reports every scenario's problems instead of stopping at
      // the first — a silent screenshot of a broken page is the failure mode
      // this whole harness exists to prevent.
      const problems = []
      let loadCount = 0
      const detach = on((message) => {
        if (message.sessionId !== sessionId) return
        if (message.method === 'Page.loadEventFired') loadCount += 1
        if (message.method === 'Runtime.exceptionThrown') {
          problems.push(message.params.exceptionDetails?.exception?.description || 'uncaught exception')
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
          problems.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
        }
      })

      return {
        problems,
        call,

        async goto(url, timeout = 30000) {
          const before = loadCount
          await call('Page.navigate', { url })
          const deadline = Date.now() + timeout
          while (loadCount === before) {
            if (Date.now() > deadline) throw new Error(`Timed out loading ${url}`)
            await sleep(100)
          }
        },

        /** Poll until `expression` evaluates truthy. */
        async waitFor(expression, timeout = 20000) {
          const deadline = Date.now() + timeout
          for (;;) {
            const { result } = await call('Runtime.evaluate', { expression, returnByValue: true })
            if (result.value) return
            if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${expression}`)
            await sleep(150)
          }
        },

        async evaluate(expression) {
          const { result, exceptionDetails } = await call('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
          })
          if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || 'evaluate failed')
          return result.value
        },

        async screenshot({ fullPage = true } = {}) {
          let clip
          if (fullPage) {
            const metrics = await call('Page.getLayoutMetrics')
            const size = metrics.cssContentSize || metrics.contentSize
            clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 }
          }
          const { data } = await call('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: fullPage,
            ...(clip ? { clip } : {}),
          })
          return Buffer.from(data, 'base64')
        },

        async close() {
          detach()
          await send('Target.closeTarget', { targetId })
        },
      }
    },

    async close() {
      try {
        socket.close()
      } catch {
        /* already closing */
      }
      child.kill()
    },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
