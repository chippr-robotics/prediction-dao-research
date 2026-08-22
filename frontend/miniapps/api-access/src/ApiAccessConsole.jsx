import { useCallback, useState } from 'react'
import { useMiniAppHost } from '@fairwins/miniapp-sdk'

import './style.css'
import ConnectionCard from './ConnectionCard'
import IntrospectionPanel from './IntrospectionPanel'
import KeyLifecycleCard from './KeyLifecycleCard'
import McpSetupPanel from './McpSetupPanel'
import OpenApiExplorer from './OpenApiExplorer'
import TryItPanel from './TryItPanel'
import { DEFAULT_BASE_URL } from './apiClient'
import { readConsoleSettings, writeBaseUrl } from './consoleStore'
import { useOpenApi } from './useOpenApi'

/**
 * The member developer console (spec 095).
 *
 * Two pieces of state live here and are passed down, because every panel needs both and neither may
 * be fetched twice:
 *
 *   baseUrl — configuration. Read from the app's store at mount, written back on save.
 *   token   — a CREDENTIAL. React state, this mount only. It is never written to the store, never
 *             put in a URL, never handed to `audit.log`, and never interpolated into anything the
 *             member copies. Leaving the app is what clears it, which the connection card states.
 *
 * The OpenAPI document is loaded once here and shared, so the endpoint list the member reads and
 * the picker they send from are the same object and cannot disagree.
 */
export default function ApiAccessConsole() {
  const host = useMiniAppHost()

  // Read once at mount. An empty saved value falls back to the public default so the console is
  // usable immediately — but `savedBaseUrl` stays empty, so the card can tell the member that
  // nothing has been saved yet rather than implying they chose this.
  const [savedBaseUrl, setSavedBaseUrl] = useState(() => readConsoleSettings(host.store).baseUrl)
  const [baseUrl, setBaseUrl] = useState(() => readConsoleSettings(host.store).baseUrl || DEFAULT_BASE_URL)
  const [token, setToken] = useState('')

  const spec = useOpenApi(baseUrl)

  const onSaveBaseUrl = useCallback((next) => {
    setBaseUrl(next)
    const persisted = writeBaseUrl(host.store, next)
    // Only claim it is saved if the store said so. A failed write still changes the address in use
    // for this session — the two facts are reported separately rather than merged into "saved".
    if (persisted) setSavedBaseUrl(next)
    return persisted
  }, [host])

  return (
    <div className="api-access">
      <p className="aa-intro">
        Your FairWins account, over HTTP. Read your own data, quote live fees, and build unsigned
        transactions for your wallet to sign — there is no endpoint here that moves value, and no
        credential here that could.
      </p>

      <ConnectionCard
        baseUrl={baseUrl}
        savedBaseUrl={savedBaseUrl}
        onSaveBaseUrl={onSaveBaseUrl}
        token={token}
        onTokenChange={setToken}
      />

      <IntrospectionPanel baseUrl={baseUrl} token={token} />

      <OpenApiExplorer state={spec} />

      <TryItPanel baseUrl={baseUrl} token={token} spec={spec} />

      <McpSetupPanel baseUrl={baseUrl} />

      <KeyLifecycleCard />
    </div>
  )
}
