import { documentInfo, groupByTag } from './openapiModel'

/**
 * The API's own description, rendered (spec 095).
 *
 * THREE STATES, and the failing one shows NO LIST. An endpoint roster that could not be read is not
 * an API with no endpoints, and an empty table here would be a fabricated fact — the member would
 * reasonably conclude their gateway serves nothing. So `unavailable` renders an alert naming what
 * happened, a retry, and nothing else.
 *
 * The document is the single source for what this console knows: the "try it" picker is built from
 * the same object, so an endpoint listed here is one the member can actually reach.
 */
export default function OpenApiExplorer({ state }) {
  return (
    <section className="aa-card">
      <h2 className="aa-card-title">Endpoints</h2>

      {state.status === 'idle' && (
        <p className="aa-notice" role="status">
          Save a gateway address above to load the API description.
        </p>
      )}

      {state.status === 'loading' && (
        <p className="aa-notice" role="status">Loading the API description…</p>
      )}

      {state.status === 'unavailable' && (
        <div className="aa-error" role="alert">
          <p className="aa-error-title">The API description could not be loaded.</p>
          {state.error ? (
            <p>
              The gateway answered <code>{state.httpStatus}</code>{' '}
              <code>{state.error.code}</code>
              {state.error.reason ? ` — ${state.error.reason}` : ''}
            </p>
          ) : (
            <p>{state.reason}</p>
          )}
          <p className="aa-help">
            Nothing is listed below because nothing was read — this is not a gateway with no
            endpoints.
          </p>
          <button type="button" className="aa-btn" onClick={state.reload}>Retry</button>
        </div>
      )}

      {state.status === 'read' && <SpecView doc={state.doc} />}
    </section>
  )
}

function SpecView({ doc }) {
  const info = documentInfo(doc)
  const groups = groupByTag(doc)

  return (
    <div>
      <div className="aa-spec-head">
        <h3 className="aa-spec-title">{info.title}</h3>
        <p className="aa-help">
          {info.version && <>Version <code>{info.version}</code>. </>}
          {info.openapi && <>OpenAPI <code>{info.openapi}</code>.</>}
        </p>
        {info.summary && <p className="aa-spec-summary">{info.summary}</p>}
      </div>

      {groups.length === 0 ? (
        // Distinct from a failed read on purpose: the document WAS read, and it genuinely declares
        // no operations. That is a fact about this gateway, not a gap in this console.
        <p className="aa-notice" role="status">
          This gateway’s description declares no endpoints.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.name} className="aa-tag-group">
            <h4 className="aa-tag-name">{group.label}</h4>
            {group.description && <p className="aa-help">{group.description}</p>}
            <ul className="aa-op-list">
              {group.operations.map((op) => (
                <li key={op.key} className="aa-op">
                  <div className="aa-op-head">
                    <span className={`aa-method aa-method-${op.method.toLowerCase()}`}>{op.method}</span>
                    <code className="aa-op-path">{op.path}</code>
                  </div>
                  {op.summary && <p className="aa-op-summary">{op.summary}</p>}
                  <p className="aa-op-scope">
                    {op.scope ? (
                      <>Requires scope <code>{op.scope}</code></>
                    ) : (
                      <>No scope required</>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
