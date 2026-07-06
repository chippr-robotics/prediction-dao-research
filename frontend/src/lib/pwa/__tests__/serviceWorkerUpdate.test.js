import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  registerServiceWorker,
  subscribe,
  getUpdateReadySnapshot,
  applyUpdate,
  checkForUpdate,
  __resetForTests,
} from '../serviceWorkerUpdate'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeWorker() {
  const listeners = {}
  return {
    state: 'installing',
    postMessage: vi.fn(),
    addEventListener: (type, cb) => { listeners[type] = cb },
    setState(next) {
      this.state = next
      listeners.statechange?.()
    },
  }
}

function makeRegistration() {
  const listeners = {}
  return {
    waiting: null,
    installing: null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: (type, cb) => { listeners[type] = cb },
    fire: (type) => listeners[type]?.(),
  }
}

function installFakeServiceWorker({ hasController = true } = {}) {
  const registration = makeRegistration()
  const swListeners = {}
  const serviceWorker = {
    controller: hasController ? {} : null,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type, cb) => { swListeners[type] = cb },
    fire: (type) => swListeners[type]?.(),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })
  return { registration, serviceWorker }
}

// Drive registerServiceWorker through the window 'load' handler and let register() resolve.
async function boot() {
  registerServiceWorker()
  window.dispatchEvent(new Event('load'))
  await flush()
}

describe('serviceWorkerUpdate', () => {
  let reloadSpy
  let originalLocation

  beforeEach(() => {
    __resetForTests()
    reloadSpy = vi.fn()
    // jsdom's location.reload is non-configurable, so swap the whole location object.
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hash: '', reload: reloadSpy },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    delete navigator.serviceWorker
    vi.restoreAllMocks()
  })

  it('flags an update when a new worker installs behind an existing controller', async () => {
    const { registration } = installFakeServiceWorker({ hasController: true })
    const cb = vi.fn()
    subscribe(cb)

    await boot()
    expect(getUpdateReadySnapshot()).toBe(false)

    // Browser finds a new worker → it installs.
    const worker = makeWorker()
    registration.installing = worker
    registration.fire('updatefound')
    worker.setState('installed')

    expect(getUpdateReadySnapshot()).toBe(true)
    expect(cb).toHaveBeenCalled()
  })

  it('does NOT flag an update on the first install (no existing controller)', async () => {
    const { registration } = installFakeServiceWorker({ hasController: false })
    await boot()

    const worker = makeWorker()
    registration.installing = worker
    registration.fire('updatefound')
    worker.setState('installed')

    expect(getUpdateReadySnapshot()).toBe(false)
  })

  it('applyUpdate posts SKIP_WAITING and reloads once the new worker takes control', async () => {
    const { registration, serviceWorker } = installFakeServiceWorker({ hasController: true })
    await boot()

    const worker = makeWorker()
    registration.installing = worker
    registration.fire('updatefound')
    worker.setState('installed')

    expect(applyUpdate()).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })

    // The new worker activates → controllerchange → reload (user-approved).
    serviceWorker.fire('controllerchange')
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('does not reload on controllerchange that the user did not trigger', async () => {
    const { serviceWorker } = installFakeServiceWorker({ hasController: true })
    await boot()

    // First-ever activation fires controllerchange without any applyUpdate() call.
    serviceWorker.fire('controllerchange')
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('applyUpdate returns false when no update is waiting', async () => {
    installFakeServiceWorker({ hasController: true })
    await boot()
    expect(applyUpdate()).toBe(false)
  })

  it('checkForUpdate polls the registration', async () => {
    const { registration } = installFakeServiceWorker({ hasController: true })
    await boot()
    await checkForUpdate()
    expect(registration.update).toHaveBeenCalled()
  })

  it('picks up a worker that was already waiting at registration time', async () => {
    const { registration } = installFakeServiceWorker({ hasController: true })
    registration.waiting = makeWorker()
    await boot()
    expect(getUpdateReadySnapshot()).toBe(true)
  })
})
