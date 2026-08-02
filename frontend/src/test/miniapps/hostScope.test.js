/**
 * Spec 073 T013 — the host's shared-module scope (research R2).
 *
 * Two things are actually being tested here, and neither is "the object has
 * keys". The first is that the scope IS the host's own singletons: a mini-app
 * that got a second React would not render, so identity (`===`) is the
 * assertion, not shape. The second is that the scope is the exact surface the
 * build preset externalizes — this file imports `tools/miniapp-build/constants.js`
 * directly and compares, because a drift between the two halves of that contract
 * produces a package that builds cleanly and gets `undefined` at runtime, which
 * no other test in the repo would catch.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as JsxRuntime from 'react/jsx-runtime'
import * as Ethers from 'ethers'

import {
  HOST_SCOPE_SYMBOL,
  HOST_API_VERSION,
  installHostScope,
  isHostApiSupported,
} from '../../lib/miniapps/hostScope'
import {
  APP_ID_PATTERN,
  HOST_PERMISSIONS,
  HOST_SHARED_MODULES,
  MANIFEST_SCHEMA,
  STORE_KEY_PATTERN,
  SUPPORTED_HOST_API,
  VERSION_PATTERN,
} from '../../lib/miniapps/manifest'
import { useMiniAppHost } from '../../lib/miniapps/hostContext'
import {
  APP_ID_PATTERN as BUILD_APP_ID_PATTERN,
  HOST_SCOPE_SYMBOL_KEY,
  HOST_API_VERSION as BUILD_HOST_API_VERSION,
  HOST_PERMISSIONS as BUILD_HOST_PERMISSIONS,
  MANIFEST_SCHEMA as BUILD_MANIFEST_SCHEMA,
  SHARED_MODULES,
  SHARED_MODULE_SPECIFIERS,
  STORE_KEY_PATTERN as BUILD_STORE_KEY_PATTERN,
  VERSION_PATTERN as BUILD_VERSION_PATTERN,
} from '../../../../tools/miniapp-build/constants.js'

describe('host scope installation', () => {
  it('publishes the scope under the registered symbol the build preset writes into', () => {
    expect(HOST_SCOPE_SYMBOL).toBe(Symbol.for('fairwins.miniapp.host'))
    expect(HOST_SCOPE_SYMBOL).toBe(Symbol.for(HOST_SCOPE_SYMBOL_KEY))

    const scope = installHostScope()
    expect(globalThis[HOST_SCOPE_SYMBOL]).toBe(scope)
  })

  it('is idempotent — a second call returns the same scope and never replaces it', () => {
    const first = installHostScope()
    const second = installHostScope()
    expect(second).toBe(first)
    expect(globalThis[HOST_SCOPE_SYMBOL]).toBe(first)
  })

  it('cannot be re-pointed by code running in the same realm', () => {
    const scope = installHostScope()
    // A mini-app swapping its own "React" in for the host's is the attack the
    // non-writable, non-configurable property exists to stop.
    expect(() => {
      globalThis[HOST_SCOPE_SYMBOL] = { react: {} }
    }).toThrow(TypeError)
    expect(() => {
      delete globalThis[HOST_SCOPE_SYMBOL]
    }).toThrow(TypeError)
    expect(globalThis[HOST_SCOPE_SYMBOL]).toBe(scope)
  })

  it('freezes the scope so its entries cannot be swapped in place', () => {
    const scope = installHostScope()
    expect(Object.isFrozen(scope)).toBe(true)
    expect(() => {
      scope.react = {}
    }).toThrow(TypeError)
  })
})

describe('shared-module surface', () => {
  it('exposes exactly the declared specifiers — no more, no less', () => {
    const scope = installHostScope()
    expect(Object.keys(scope).sort()).toEqual([...HOST_SHARED_MODULES].sort())
  })

  it('hands out the HOST’s own singletons, not copies', () => {
    const scope = installHostScope()
    // Identity, not shape: two React copies cannot share one element tree.
    expect(scope.react.useState).toBe(React.useState)
    expect(scope['react-dom'].createPortal).toBe(ReactDOM.createPortal)
    expect(scope['react/jsx-runtime'].jsx).toBe(JsxRuntime.jsx)
    expect(scope.ethers.keccak256).toBe(Ethers.keccak256)
  })

  it('publishes the SDK as exactly the bindings the build preset re-exports', () => {
    const scope = installHostScope()
    const sdk = scope['@fairwins/miniapp-sdk']
    expect(sdk.useMiniAppHost).toBe(useMiniAppHost)

    const declared = SHARED_MODULES.find((entry) => entry.specifier === '@fairwins/miniapp-sdk')
    // The SDK has no implementation on disk, so the preset falls back to this
    // declared list; a binding here that is missing there cannot be imported.
    expect(Object.keys(sdk).sort()).toEqual([...declared.exports].sort())
    expect(Object.isFrozen(sdk)).toBe(true)
  })
})

describe('build-preset twin (tools/miniapp-build/constants.js)', () => {
  it('externalizes exactly the specifiers this host provides', () => {
    expect([...SHARED_MODULE_SPECIFIERS].sort()).toEqual([...HOST_SHARED_MODULES].sort())
  })

  it('agrees with the host on the runtime-contract version', () => {
    expect(HOST_API_VERSION).toBe(SUPPORTED_HOST_API)
    expect(HOST_API_VERSION).toBe(BUILD_HOST_API_VERSION)
  })

  // The shared-module list is not the only value declared twice across the
  // build/host boundary — the preset is Node tooling, so it cannot import the
  // host's module and restates the manifest contract instead. Each of the values
  // below fails in its own quiet way if the two copies drift: a schema
  // disagreement refuses every package, a permission the preset accepts but the
  // host does not refuses the packages that use it, and a pattern disagreement
  // lets a package build with an id/version/store key the host will not honor.
  // All of them are build-clean, launch-broken — the failure mode this describe
  // block exists to make impossible.
  it('agrees with the host on the manifest schema id', () => {
    expect(BUILD_MANIFEST_SCHEMA).toBe(MANIFEST_SCHEMA)
  })

  it('offers exactly the capabilities the host exposes', () => {
    expect([...BUILD_HOST_PERMISSIONS].sort()).toEqual([...HOST_PERMISSIONS].sort())
  })

  it('validates ids, versions and store keys the same way the host does', () => {
    expect(BUILD_APP_ID_PATTERN.source).toBe(APP_ID_PATTERN.source)
    expect(BUILD_VERSION_PATTERN.source).toBe(VERSION_PATTERN.source)
    expect(BUILD_STORE_KEY_PATTERN.source).toBe(STORE_KEY_PATTERN.source)
  })
})

describe('hostApi compatibility', () => {
  it('supports this version and every older one', () => {
    expect(isHostApiSupported(HOST_API_VERSION)).toBe(true)
    expect(isHostApiSupported(1)).toBe(true)
  })

  it('refuses a contract newer than this host implements', () => {
    expect(isHostApiSupported(HOST_API_VERSION + 1)).toBe(false)
  })

  it('refuses anything that is not a positive integer version', () => {
    for (const value of [0, -1, 1.5, '1', null, undefined, NaN, {}]) {
      expect(isHostApiSupported(value)).toBe(false)
    }
  })
})
