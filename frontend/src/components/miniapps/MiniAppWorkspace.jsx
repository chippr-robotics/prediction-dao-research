/**
 * MiniAppWorkspace (spec 073, T024 · FR-010, FR-013–FR-016) — the route that
 * actually RUNS a mini-app.
 *
 * Everything the catalog does is browsing. This is the surface where third-party
 * code becomes code the member's session executes, so its job is not "render an
 * app" — it is to establish, in order, that there is something it is allowed to
 * run, bind that thing to an identity, and only then hand the result to the
 * loader. Four rules shape the file.
 *
 * **1. THE RECORD IS RE-READ AT LAUNCH, ALWAYS (FR-010).** The workspace never
 * receives a record as a prop and never reads the catalog memo. It resolves the
 * URL slug against the chain on every mount, because the window that closes is
 * precisely the one a curator uses: suspending a compromised app between a
 * member opening the catalog and clicking Launch. A record that went Suspended
 * in that window is refused here even though the catalog card that was clicked
 * still says otherwise.
 *
 * **2. `launchable` IS THE SERVING DECISION, NOT `status`.** A Pending record CAN
 * be launchable — a live app whose vendor has an update in review, still serving
 * its last reviewed package (FR-003). Gating on `status === Approved` would hand
 * every vendor an offline switch for their own live app, so the chain's own
 * `launchable` is what admits a launch. `status` is read only to EXPLAIN a
 * refusal: suspended, retired, and never-reviewed are three different things to
 * tell a member.
 *
 * **3. THE APP IS NAMED BEFORE IT IS LOADED — TWICE, DIFFERENTLY.** Registry
 * records carry no slug, so two identities are derived from the record and they
 * are deliberately not the same string:
 *   - `appSlug(record.name)` — from the chain's unique-by-construction NAME — is
 *     passed to the loader as `expectedAppId`, which is what makes its
 *     `manifest.id` check real rather than inert. A package that identifies
 *     itself as a different app than the listing being launched does not run.
 *   - `appNamespaceKey(chainId, record.id)` — from the IMMUTABLE numeric id plus
 *     the registry chain — is the app's store namespace and audit attribution.
 *     Names can be edited and are re-registrable on another network; a registry
 *     id is neither. See the note on {@link appNamespaceKey} for why that
 *     distinction is load-bearing rather than fussy.
 *
 * **4. A MINI-APP FAILURE IS CONTAINED, NOT PROPAGATED (FR-015).** The mounted
 * component sits inside an error boundary placed OUTSIDE the host provider, so a
 * throw from either the app or the provider's own namespace construction lands in
 * a workspace-local error state with a remount affordance. The host chrome, the
 * nav and every other route survive it.
 *
 * REFUSALS ARE SPECIFIC AND THEY ARE NEVER RAW. Each failure mode has its own
 * message naming what happened and what it means for the member; the typed
 * errors the loader/registry client raise already carry member-facing text, so
 * that text is used verbatim rather than re-worded here. An exception this file
 * does not recognise is logged in full to the console and reported to the member
 * as one honest sentence — a stack trace is not an explanation.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { AppStatus } from '../../abis/miniAppRegistry'
import {
  captureMiniAppIntegrityFailure,
  captureMiniAppLaunch,
  captureMiniAppLog,
} from '../../data/ledger/sources/miniAppSource'
import { useEffectiveAccount } from '../../hooks/useEffectiveAccount'
import { MiniAppHostProvider, useMiniAppHost } from '../../lib/miniapps/hostContext'
import {
  AppNotLaunchableError,
  GatewayUnavailableError,
  HostApiError,
  IntegrityError,
  ManifestError,
  MANIFEST_REFUSAL,
  loadMiniApp,
} from '../../lib/miniapps/loader'
import {
  REGISTRY_STATUS,
  appNamespaceKey,
  appSlug,
  fetchAppBySlug,
} from '../../lib/miniapps/registryClient'
import Button from '../ui/Button'
import ErrorBoundary from '../ui/ErrorBoundary'
// Shared stylesheet for the whole mini-app section; the workspace chrome lives at its foot. The
// mounted package's own styles are injected separately and scoped to the mount point (FR-014).
import './miniapps.css'

/**
 * Audit kind for a contained mini-app crash. The `host:` prefix is reserved for
 * entries the HOST wrote (`hostContext.jsx` refuses it from apps), which is what
 * keeps "the app reported this" distinguishable from "the host observed this".
 */
const HOST_AUDIT_CRASH = 'host:app_crashed'

/**
 * Wrap a mini-app stylesheet so its rules cannot select host or sibling-app
 * chrome (FR-014), or return `null` when the sheet cannot be wrapped safely.
 *
 * `@scope` is the purpose-built primitive for this and it is what the host uses.
 * Two things are worth being precise about, because a control nobody understands
 * the limits of is worse than none:
 *
 * - **What the balance check buys.** Wrapping is TEXT, and text can be escaped: a
 *   sheet ending in a stray `}` would close the `@scope` block early and
 *   everything after it would apply to the whole document. So a sheet whose
 *   braces do not balance — counting neither comments nor string literals — is
 *   refused outright rather than injected. That turns the wrapper from a
 *   convention into something a package cannot walk out of by accident or on
 *   purpose.
 * - **What it does not buy.** This is not a sandbox, and it is not the primary
 *   mechanism: packages are built with per-package class names (the build
 *   preset's CSS-module convention) and curation is the trust boundary (research
 *   R12). On an engine without `@scope` the whole block is dropped, so the app
 *   renders unstyled rather than the host being restyled — the failure mode is
 *   cosmetic on the app's side, never on the host's.
 *
 * A refused or dropped sheet never blocks a launch: these bytes are already
 * proven authentic, so a defect in them is a cosmetic flaw in an approved
 * package rather than a reason to withhold the app (the same reasoning that
 * makes `loader.js` decode stylesheets leniently).
 *
 * @param {string} css - stylesheet text, already verified against the manifest
 * @param {string} rootId - DOM id of the workspace root the rules are confined to
 * @returns {string|null} the wrapped stylesheet, or null when it must not be used
 */
function scopeCss(css, rootId) {
  if (typeof css !== 'string' || css.trim() === '') return null
  if (escapesItsBlock(css)) return null
  return `@scope (#${rootId}) {\n${css}\n}`
}

/**
 * Whether a stylesheet would break out of a `{ … }` wrapper placed around it.
 *
 * True when the braces do not balance: more closers than openers at any point
 * (the sheet escapes) or an unclosed block at the end (the wrapper's own closer
 * would be consumed by it, changing what the following bytes mean). Comments and
 * quoted strings are skipped, because a `}` inside either is data, not structure.
 */
function escapesItsBlock(css) {
  let depth = 0
  let i = 0
  while (i < css.length) {
    const char = css[i]
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      // An unterminated comment swallows the rest of the sheet — including the
      // wrapper's closing brace — so it is a break-out just as much as a stray
      // `}` is.
      if (end === -1) return true
      i = end + 2
      continue
    }
    if (char === '"' || char === "'") {
      i += 1
      while (i < css.length && css[i] !== char) {
        if (css[i] === '\\') i += 1
        i += 1
      }
      // An unterminated string has the same effect as an unterminated comment.
      if (i >= css.length) return true
      i += 1
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth < 0) return true
    }
    i += 1
  }
  return depth !== 0
}

/** The registry answered and holds nothing under this slug. */
function notFoundRefusal(slug) {
  return {
    code: 'not-found',
    title: 'No such app',
    message:
      `The registry this build reads holds no app named “${slug}”. Check the link, or open the Apps ` +
      'catalog and launch it from there.',
    retryable: false,
  }
}

/**
 * Turn a registry outcome into a refusal, or `null` when the record may run.
 *
 * The three failure outcomes are kept apart because they mean different things
 * to a member and imply different next steps: this build has no registry at all,
 * we could not reach the registry it has, or the registry answered and holds no
 * such listing. Collapsing them would tell someone their link is broken when the
 * network is down.
 */
function describeRegistryOutcome(outcome, slug) {
  if (outcome?.status !== REGISTRY_STATUS.OK) {
    if (outcome?.status === REGISTRY_STATUS.NOT_DEPLOYED) {
      return {
        code: 'registry-not-deployed',
        title: 'Apps are not available on this build',
        message:
          'No mini-app registry is configured for this environment, so there is nothing to verify an ' +
          'app against and nothing can be launched here.',
        retryable: false,
      }
    }

    if (outcome?.status === REGISTRY_STATUS.NOT_FOUND) {
      return notFoundRefusal(slug)
    }

    // `unreachable`, and anything unrecognised. Defaulting to "could not verify"
    // is the only safe direction: an outcome this host cannot read is an
    // unverified record, and an unverified record must never be launched.
    return {
      code: 'registry-unreachable',
      title: 'This app could not be verified',
      message:
        'The app registry could not be reached, so it was not possible to confirm that this app is ' +
        'approved or which package it should run. Nothing is launched without that check. Try again ' +
        'once your connection to the network is back.',
      retryable: true,
    }
  }

  const app = outcome.app
  // The chain's own serving decision. A Pending record with a previously
  // approved package passes here — that is a live app with an update in review.
  if (app.launchable) return null

  if (app.status === AppStatus.SUSPENDED) {
    return {
      code: 'suspended',
      title: 'This app is suspended',
      message:
        'A curator has suspended this app, so it cannot be launched and none of its package was ' +
        'downloaded. Anything you saved in it is untouched and will be there again if the suspension ' +
        'is lifted.',
      retryable: false,
    }
  }

  if (app.status === AppStatus.DEPRECATED) {
    return {
      code: 'deprecated',
      title: 'This app has been retired',
      message:
        'This app was permanently retired by a curator and can no longer be launched. Anything you ' +
        'saved in it is untouched, but the app itself will not return.',
      retryable: false,
    }
  }

  // Listed, but nothing has ever been promoted to the approved tuple.
  return {
    code: 'never-approved',
    title: 'This app is still in review',
    message:
      'No version of this app has been approved yet, so there is no reviewed package to run. It will ' +
      'become available once a curator approves the version its vendor submitted.',
    retryable: false,
  }
}

/**
 * Turn a launch failure into a refusal.
 *
 * Every typed error from the loader already carries a `userMessage` written for
 * a member; those are used verbatim so the explanation stays in one place and
 * cannot drift from the condition that produced it. Only the heading is chosen
 * here, and only an unrecognised error gets host-authored copy — because there
 * is nothing honest to say about it beyond that it happened.
 */
function describeLaunchFailure(error) {
  if (error instanceof IntegrityError) {
    return {
      code: 'integrity',
      title: 'This package failed verification',
      message: error.userMessage,
      retryable: false,
    }
  }
  if (error instanceof HostApiError) {
    return {
      code: 'host-api',
      title: 'This app needs a newer version of the platform',
      message: error.userMessage,
      retryable: false,
    }
  }
  if (error instanceof ManifestError) {
    return {
      code: error.reason === MANIFEST_REFUSAL.IDENTITY_MISMATCH ? 'identity-mismatch' : 'package-invalid',
      title:
        error.reason === MANIFEST_REFUSAL.IDENTITY_MISMATCH
          ? 'This package is not this app'
          : 'This package could not be read',
      message: error.userMessage,
      retryable: false,
    }
  }
  if (error instanceof GatewayUnavailableError) {
    return {
      code: 'gateway',
      title: 'The app package could not be downloaded',
      message: error.userMessage,
      // Availability, not integrity: retrying is the right affordance.
      retryable: true,
    }
  }
  if (error instanceof AppNotLaunchableError) {
    return {
      code: 'not-launchable',
      title: 'This app is not available',
      message: error.userMessage,
      retryable: false,
    }
  }

  // Unrecognised. The detail belongs in the console, where it can be diagnosed;
  // pasting an exception at a member explains nothing and can leak internals.
  console.error('[miniapps/workspace] launch failed with an unrecognised error', error)
  return {
    code: 'unexpected',
    title: 'This app could not be started',
    message:
      'Something went wrong while preparing this app and it was not started. Nothing from its package ' +
      'was run. Try again, and report this to the platform team if it keeps happening.',
    retryable: true,
  }
}

/**
 * The mounted app itself.
 *
 * Reads the host object from the context it is already inside and passes it as
 * the single `host` prop, which is the runtime contract's calling convention
 * (`contracts/host-context.md`) — a package may take it as a prop or reach it
 * with `useMiniAppHost()`, and both must give it the same object.
 */
function MiniAppSurface({ component }) {
  const host = useMiniAppHost()
  // Bound to a capitalized local because JSX reads a lowercase tag name as an
  // intrinsic element rather than a component.
  const Mounted = component
  return <Mounted host={host} />
}

/**
 * `/apps/:slug` — the route element.
 *
 * Deliberately thin: all it does is give the launch sequence a KEY. A different
 * slug, or a member retrying, is a different launch and gets a fresh component
 * rather than one that has to unpick the previous attempt's state — which is
 * also why nothing below has to reset itself when its inputs change.
 */
export default function MiniAppWorkspace() {
  const { slug } = useParams()
  /** Bumped by "Try again" — re-keys the launch, so a retry re-verifies from scratch. */
  const [attempt, setAttempt] = useState(0)

  return (
    <MiniAppLaunch
      key={`${slug}:${attempt}`}
      slug={slug}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  )
}

/**
 * Verify, load and mount one mini-app. Mounted fresh per launch attempt.
 */
function MiniAppLaunch({ slug, onRetry }) {
  const { address } = useEffectiveAccount()

  // `{ phase: 'resolving' | 'loading' | 'ready' | 'refused', … }` in ONE piece of
  // state: a refusal and a mounted package must never be renderable at the same
  // time, which two independent `useState`s would allow for a frame.
  const [launch, setLaunch] = useState({ phase: 'resolving' })
  /** Bumped by "Restart app" — re-keys the error boundary and remounts (FR-016). */
  const [mountKey, setMountKey] = useState(0)

  // The acting account is read through a ref rather than a dependency on
  // purpose. It is needed only to attribute audit entries, and making it a
  // dependency would re-fetch and re-import the whole package every time a
  // member connected a wallet or switched to a vault — throwing away a running
  // app for a change that does not affect what may be run. Kept current in its
  // own effect (declared first, so it settles before the launch effect below)
  // rather than assigned during render.
  const accountRef = useRef(address)
  useEffect(() => {
    accountRef.current = address
  }, [address])

  // A DOM id that is unique per mounted workspace and valid as a CSS selector.
  // `useId` returns a value containing `:` characters, which cannot appear in a
  // selector unescaped — the workspace root is the scope root for the app's own
  // stylesheets, so this id has to be usable in one.
  const generatedId = useId()
  const rootId = useMemo(() => `miniapp-root-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [generatedId])

  useEffect(() => {
    let live = true
    const controller = new AbortController()

    const run = async () => {
      // (1) THE LAUNCH READ (FR-010). Straight to the chain, every time.
      const outcome = await fetchAppBySlug(slug)
      if (!live) return

      const registryRefusal = describeRegistryOutcome(outcome, slug)
      if (registryRefusal) {
        setLaunch({ phase: 'refused', refusal: registryRefusal })
        return
      }

      const record = outcome.app
      const chainId = outcome.chainId

      // (2) IDENTITY, BEFORE ANY BYTE IS FETCHED. Both derivations must succeed:
      // without the slug the loader's manifest-id check has nothing to compare
      // against, and without the namespace key there is no isolated place to
      // keep the app's state. Launching with either missing would run the
      // package unbound, which is the gap this whole path exists to close.
      const expectedAppId = appSlug(record.name)
      const namespaceKey = appNamespaceKey(chainId, record.id)
      if (!expectedAppId || !namespaceKey) {
        setLaunch({
          phase: 'refused',
          refusal: {
            code: 'unidentifiable',
            title: 'This app cannot be identified',
            message:
              'This listing’s registered name cannot be used as a stable app address, so its package ' +
              'could not be bound to it and nothing was launched. Please report this to the platform team.',
            retryable: false,
          },
        })
        return
      }

      setLaunch({ phase: 'loading', appName: record.name })

      // (3) FETCH + VERIFY + IMPORT. The loader is the only thing that turns
      // bytes into code, and it does so only after every check has passed.
      let loaded
      try {
        loaded = await loadMiniApp(record, { expectedAppId, signal: controller.signal })
      } catch (error) {
        if (!live) return
        if (error instanceof IntegrityError) {
          // A supply-chain event, not a bad day: recorded whether or not the
          // member ever reports it (FR-011/FR-019).
          captureMiniAppIntegrityFailure(accountRef.current, chainId, {
            appId: namespaceKey,
            reason: error.reason,
            cid: record.approved?.cid,
            path: error.path,
            expected: error.expected,
            actual: error.actual,
          })
        }
        setLaunch({ phase: 'refused', refusal: describeLaunchFailure(error) })
        return
      }
      if (!live) return

      captureMiniAppLaunch(accountRef.current, chainId, {
        appId: namespaceKey,
        version: loaded.manifest.version,
        manifestHash: loaded.manifestHash,
        cid: loaded.cid,
      })

      setLaunch({
        phase: 'ready',
        chainId,
        namespaceKey,
        manifest: loaded.manifest,
        component: loaded.component,
        styles: loaded.styles,
      })
    }

    run().catch((error) => {
      // `run` handles every failure it expects; reaching here means the workspace
      // itself misbehaved, and it must still leave the member with a surface.
      if (!live) return
      setLaunch({ phase: 'refused', refusal: describeLaunchFailure(error) })
    })

    return () => {
      live = false
      // Abandons in-flight gateway fetches so leaving the workspace does not
      // keep pulling a package the member is no longer waiting for.
      controller.abort()
    }
    // `slug` is the only input: a retry arrives as a new key from the route
    // element, which remounts this component rather than re-running the effect.
  }, [slug])

  /** Stylesheets confined to this workspace root; unusable sheets are dropped. */
  const scopedStyles = useMemo(() => {
    if (launch.phase !== 'ready') return []
    return launch.styles
      .map((style) => ({ path: style.path, css: scopeCss(style.css, rootId) }))
      .filter((style) => {
        if (style.css !== null) return true
        console.warn(
          `[miniapps/workspace] stylesheet "${style.path}" could not be confined to the app's workspace — not applied`,
        )
        return false
      })
  }, [launch, rootId])

  const handleAppError = useCallback(
    (error) => {
      if (launch.phase !== 'ready') return
      // ErrorBoundary already logs the error and the component stack; this is the
      // compliance-visible half — the host recording that an app failed, which
      // the app itself cannot decline to report.
      captureMiniAppLog(accountRef.current, launch.chainId, {
        appId: launch.namespaceKey,
        kind: HOST_AUDIT_CRASH,
        refs: { version: launch.manifest.version, reason: error?.message || 'unknown' },
      })
    },
    [launch],
  )

  if (launch.phase === 'resolving' || launch.phase === 'loading') {
    return (
      <div className="miniapp-workspace section">
        <p role="status" aria-live="polite">
          {launch.phase === 'resolving'
            ? 'Checking this app against the registry…'
            : `Verifying and loading ${launch.appName}…`}
        </p>
      </div>
    )
  }

  if (launch.phase === 'refused') {
    const { refusal } = launch
    return (
      <div className="miniapp-workspace section">
        <div className="miniapp-workspace-refusal" role="alert" data-refusal={refusal.code}>
          <h2>{refusal.title}</h2>
          <p>{refusal.message}</p>
          {refusal.retryable && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }

  const { manifest, component, namespaceKey } = launch

  return (
    <div className="miniapp-workspace section">
      <header className="miniapp-workspace-header">
        <h2>{manifest.name}</h2>
        <p>
          Version {manifest.version} — verified against the package approved on the registry before it
          was run.
        </p>
      </header>

      {/* A named region, so a screen-reader user can move between the host's own
          chrome and the app's surface instead of walking through both as one
          undifferentiated page. It is also the `@scope` root for the app's
          stylesheets, which is why it carries the generated id. */}
      <section id={rootId} className="miniapp-workspace-root" aria-label={`${manifest.name} app`}>
        {/* Rendered declaratively rather than appended by an effect: React then
            owns their lifetime, so leaving the workspace (or remounting the app)
            removes them with the surface they belong to and cannot leave a
            previous app's rules behind (FR-014/FR-016). */}
        {scopedStyles.map((style) => (
          <style key={style.path}>{style.css}</style>
        ))}

        {/* FR-015. Outside the provider on purpose: `MiniAppHostProvider` throws
            if it cannot open an isolated namespace, and that failure has to be
            contained here too rather than taking the route down. */}
        <ErrorBoundary
          key={mountKey}
          onError={handleAppError}
          fallback={
            <div className="miniapp-workspace-crash" role="alert">
              <h3>This app stopped working</h3>
              <p>
                {manifest.name} ran into an error and was stopped. Nothing else on the platform was
                affected, and anything the app saved is still there. You can start it again, or report
                the problem to the platform team if it keeps happening.
              </p>
              <Button variant="secondary" onClick={() => setMountKey((n) => n + 1)}>
                Restart app
              </Button>
            </div>
          }
        >
          <MiniAppHostProvider appId={namespaceKey}>
            <MiniAppSurface component={component} />
          </MiniAppHostProvider>
        </ErrorBoundary>
      </section>
    </div>
  )
}
