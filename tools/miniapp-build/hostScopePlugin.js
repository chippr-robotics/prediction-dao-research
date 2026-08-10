/**
 * Host-scope externals plugin (spec 073, research R2).
 *
 * Rewrites every shared bare import (`react`, `react-dom`,
 * `react/jsx-runtime`, `ethers`, `@fairwins/miniapp-sdk`) into a generated shim
 * module that reads its bindings from the host's frozen shared-module scope at
 * `globalThis[Symbol.for('fairwins.miniapp.host')]`. The published package
 * therefore contains NO copy of React, ReactDOM or ethers — which is not a size
 * optimization but a correctness requirement: two React copies cannot share one
 * element tree, so a mini-app that bundled its own React could not render inside
 * the host's workspace at all.
 *
 * Why a shim instead of `rollupOptions.external`: an external leaves
 * `import { useState } from 'react'` in the emitted ESM, and the host imports
 * the package from a Blob URL where no bare specifier can resolve (there is no
 * import map — see R2's rejected alternatives). A shim keeps the output a single
 * self-contained ES module whose only outside reference is the host scope.
 *
 * Binding names are discovered at build time from the very module Vite would
 * otherwise have bundled (via `this.resolve`), so the shim exports exactly the
 * names the host's own copy exports — no hand-maintained export list to drift
 * across dependency upgrades. Anything the shim cannot provide fails the BUILD
 * (rollup reports the missing export) rather than the launch.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { HOST_SCOPE_SYMBOL_KEY, SHARED_MODULES } from './constants.js'

/**
 * Virtual module prefix. The leading NUL is the rollup convention for "no other
 * plugin should touch this id", and it also keeps the id out of the filesystem
 * namespace so `chunk.moduleIds` can be scanned for shim usage unambiguously.
 */
const VIRTUAL_PREFIX = '\0fairwins-miniapp-host:'

/** Legal ESM binding names. `module.exports` (a cjs-module-lexer artifact seen on
 * `react-dom` and `react/jsx-runtime`) and reserved words cannot be re-exported
 * by name, so they are dropped rather than emitted as a syntax error. */
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const RESERVED_WORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'implements', 'import', 'in',
  'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private',
  'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'
])

function isBindableName(name) {
  return IDENTIFIER_PATTERN.test(name) && !RESERVED_WORDS.has(name)
}

/** Posix-normalized id, so path comparisons behave the same on every platform. */
function toPosix(id) {
  return id.split(path.sep).join('/')
}

/**
 * Locate the installed package directory that owns a resolved file, so the
 * no-bundled-copy assertion can recognize modules coming from it even when they
 * are deep internal files (`react/cjs/react.production.js`).
 */
function packageDirFor(resolvedFile, packageName) {
  const posix = toPosix(resolvedFile)
  const marker = `/node_modules/${packageName}/`
  const at = posix.lastIndexOf(marker)
  if (at === -1) return null
  return posix.slice(0, at + marker.length - 1)
}

/**
 * Enumerate the binding names a shared module exposes.
 *
 * Discovery imports the resolved file in Node. For CJS packages (React) Node's
 * cjs-module-lexer reports the same names Vite's interop would have produced;
 * for ESM packages (ethers) the namespace is exact. If the file cannot be
 * imported in a Node context (a browser-only build), discovery falls back to
 * the specifier's own Node resolution before finally falling back to the
 * declared list in `constants.js` — and if nothing yields names, the build
 * fails loudly instead of emitting an empty shim.
 */
async function discoverExports(entry, resolvedFile) {
  const attempts = []
  if (resolvedFile) attempts.push(pathToFileURL(resolvedFile).href)
  attempts.push(entry.specifier)

  for (const attempt of attempts) {
    try {
      const namespace = await import(attempt)
      const names = Object.keys(namespace).filter(isBindableName)
      if (names.length > 0) return names.sort()
    } catch {
      // Try the next strategy; the declared fallback below is the last word.
    }
  }

  if (Array.isArray(entry.exports) && entry.exports.length > 0) {
    return [...entry.exports].filter(isBindableName).sort()
  }

  throw new Error(
    `[miniapp-build] cannot determine the exports of shared module "${entry.specifier}". ` +
      'Install it alongside the mini-app package, or declare its binding names in the ' +
      'preset\'s sharedModules option so the generated host-scope shim can re-export them.'
  )
}

/**
 * Render the generated shim for one shared specifier.
 *
 * Shape notes, both load-bearing:
 * - The scope lookup and its guards live inside ONE initializer expression
 *   rather than as standalone statements. Combined with `moduleSideEffects:
 *   false` (see `load`), that lets rollup drop the bindings the package never
 *   imports — a shim for ethers declares ~190 names, and without this the
 *   package would ship (and evaluate) every one of them — while keeping the
 *   guards alive for as long as any binding is used.
 * - The guards throw at module-evaluation time. That is the honest failure: a
 *   mini-app loaded outside the host has no React to render with, and silently
 *   `undefined` bindings would surface later as an unattributable crash inside
 *   the app's own code.
 */
function renderShim(specifier, exportNames) {
  const quoted = JSON.stringify(specifier)
  const lines = [
    `// Generated by tools/miniapp-build — host-scope shim for ${quoted}.`,
    '// This package ships no copy of the module: every binding below is read from',
    "// the host's frozen shared-module scope at load time (spec 073, research R2).",
    'const __fwModule = /* @__PURE__ */ (() => {',
    `  const scope = globalThis[Symbol.for(${JSON.stringify(HOST_SCOPE_SYMBOL_KEY)})]`,
    '  if (!scope) {',
    `    throw new Error('[miniapp] shared-module scope missing: ${specifier} is only available inside the FairWins host')`,
    '  }',
    `  const shared = scope[${quoted}]`,
    '  if (!shared) {',
    `    throw new Error('[miniapp] host does not provide the shared module ${specifier}')`,
    '  }',
    '  return shared',
    '})()'
  ]

  for (const name of exportNames) {
    if (name === 'default') continue
    lines.push(`export const ${name} = __fwModule.${name}`)
  }

  // The host publishes module NAMESPACE objects, so a CJS package's default
  // export lives at `.default` (React) while an ESM package has none (ethers) —
  // in which case the namespace itself is the sensible default.
  lines.push('export default (__fwModule.default !== undefined ? __fwModule.default : __fwModule)')

  return lines.join('\n') + '\n'
}

/**
 * Read back which shared specifiers actually survived into the emitted bundle.
 * Derived from the final chunk graph rather than from resolve hits, so
 * `manifest.sharedDeps` lists what the package genuinely needs from the host —
 * a shim that tree-shook away is not a declared dependency.
 *
 * @param {object} bundle - rollup output bundle
 * @returns {string[]} bare specifiers, sorted
 */
export function sharedDepsFromBundle(bundle) {
  const specifiers = new Set()
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue
    for (const moduleId of output.moduleIds || []) {
      if (moduleId.startsWith(VIRTUAL_PREFIX)) {
        specifiers.add(moduleId.slice(VIRTUAL_PREFIX.length))
      }
    }
  }
  return [...specifiers].sort()
}

/**
 * Create the host-scope externals plugin.
 *
 * @param {object} [options]
 * @param {Array<{specifier: string, package: string, exports?: string[]}>} [options.sharedModules]
 *   Shared-module table; defaults to {@link SHARED_MODULES}.
 * @returns {import('vite').Plugin} Vite/rollup plugin
 */
export function hostScopePlugin(options = {}) {
  const sharedModules = options.sharedModules || SHARED_MODULES
  const bySpecifier = new Map(sharedModules.map((entry) => [entry.specifier, entry]))

  // Subpaths of a shared package that are NOT themselves shared (react-dom/client,
  // react/jsx-dev-runtime) would drag a second copy of the package into the
  // bundle. They are refused at resolve time with an actionable message.
  const guardedPackages = new Set(sharedModules.map((entry) => entry.package))

  /** specifier -> { exports, packageDir } */
  const described = new Map()
  /** package name -> installed directory, for the no-bundled-copy assertion */
  const packageDirs = new Map()

  return {
    name: 'fairwins-miniapp-host-scope',
    // Must win over Vite's own resolver, which would otherwise resolve `react`
    // to the installed package and bundle it.
    enforce: 'pre',

    resolveId(source) {
      if (bySpecifier.has(source)) return VIRTUAL_PREFIX + source
      if (source.startsWith(VIRTUAL_PREFIX)) return source

      const slash = source.startsWith('@') ? source.indexOf('/', source.indexOf('/') + 1) : source.indexOf('/')
      if (slash === -1) return null
      const owner = source.slice(0, slash)
      if (!guardedPackages.has(owner)) return null

      throw new Error(
        `[miniapp-build] "${source}" is not provided by the host shared-module scope. ` +
          `The host owns the singleton copy of "${owner}", so importing another entry point ` +
          'would bundle a second copy into the package (two React copies cannot share one tree). ' +
          'Import a shared specifier instead, or extend the preset\'s sharedModules option and ' +
          'the host scope together.'
      )
    },

    async load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null
      const specifier = id.slice(VIRTUAL_PREFIX.length)
      const entry = bySpecifier.get(specifier)
      if (!entry) return null

      if (!described.has(specifier)) {
        // Resolve through the rest of the plugin pipeline so discovery reads the
        // exact file Vite would have bundled for this package root.
        const resolution = await this.resolve(specifier, undefined, { skipSelf: true })
        const resolvedFile = resolution && !resolution.external ? resolution.id : null
        const exportNames = await discoverExports(entry, resolvedFile)
        const packageDir = resolvedFile ? packageDirFor(resolvedFile, entry.package) : null
        if (packageDir) packageDirs.set(entry.package, packageDir)
        described.set(specifier, { exports: exportNames })
      }

      return renderShim(specifier, described.get(specifier).exports)
    },

    /**
     * Prove the promise: no module from a shared package reached the output.
     * Checked against both the resolved install directory and the generic
     * `node_modules/<pkg>/` shape, so a nested duplicate install is caught too.
     */
    generateBundle(_outputOptions, bundle) {
      const offenders = []
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        for (const moduleId of output.moduleIds || []) {
          if (moduleId.startsWith('\0')) continue
          const posix = toPosix(moduleId)
          for (const entry of sharedModules) {
            const dir = packageDirs.get(entry.package)
            const fromInstall = dir && posix.startsWith(`${dir}/`)
            const fromNodeModules = posix.includes(`/node_modules/${entry.package}/`)
            if (fromInstall || fromNodeModules) {
              offenders.push(`${entry.package}: ${posix}`)
              break
            }
          }
        }
      }

      if (offenders.length > 0) {
        throw new Error(
          '[miniapp-build] the package bundled a copy of a host-owned shared dependency, which ' +
            'would break rendering inside the host (duplicate React) and bloat the published bytes:\n  ' +
            offenders.join('\n  ') +
            '\nImport the shared bare specifier instead of a deep path or a re-exporting wrapper.'
        )
      }
    }
  }
}
