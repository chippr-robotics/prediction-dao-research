/**
 * Reading an OpenAPI 3.1 document into the shape this console renders (spec 095).
 *
 * Pure functions over a plain object, deliberately tolerant: the document is fetched from whatever
 * gateway the member pointed at, which may be an older build than this frozen package. Anything
 * this module cannot understand degrades to "not stated" rather than to a thrown render.
 */

/** HTTP methods an OpenAPI path item may carry. Anything else in a path item is not an operation. */
const OPERATION_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

/** Where operations with no `tags` are collected. */
export const UNTAGGED = 'other'

/**
 * The scope an operation requires, or `null` when it requires none.
 *
 * The FairWins gateway states this twice — once as a real OpenAPI `security` requirement, and once
 * as `x-fairwins-scope` because a security requirement is awkward to read at a glance. The
 * extension is preferred when present and the standard field is the fallback, so this stays correct
 * against a document written by anything else.
 */
export function scopeForOperation(operation) {
  const extension = operation && operation['x-fairwins-scope']
  if (typeof extension === 'string' && extension) return extension

  const security = operation && operation.security
  if (!Array.isArray(security)) return null
  for (const requirement of security) {
    if (!requirement || typeof requirement !== 'object') continue
    for (const scopes of Object.values(requirement)) {
      if (Array.isArray(scopes) && scopes.length > 0) return scopes.join(' ')
    }
  }
  return null
}

/**
 * Every operation in the document, in document order.
 *
 * @returns {Array<{key: string, method: string, path: string, summary: string, description: string,
 *   operationId: string|null, scope: string|null, tags: string[], parameters: object[]}>}
 */
export function listOperations(doc) {
  const paths = doc && typeof doc.paths === 'object' && doc.paths ? doc.paths : {}
  const operations = []
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue
    for (const method of OPERATION_METHODS) {
      const operation = item[method]
      if (!operation || typeof operation !== 'object') continue
      operations.push({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        summary: typeof operation.summary === 'string' ? operation.summary : '',
        description: typeof operation.description === 'string' ? operation.description : '',
        operationId: typeof operation.operationId === 'string' ? operation.operationId : null,
        scope: scopeForOperation(operation),
        tags: Array.isArray(operation.tags) ? operation.tags.filter((t) => typeof t === 'string') : [],
        parameters: [
          ...(Array.isArray(item.parameters) ? item.parameters : []),
          ...(Array.isArray(operation.parameters) ? operation.parameters : []),
        ].filter((p) => p && typeof p === 'object'),
      })
    }
  }
  return operations
}

/**
 * Group operations by tag for display.
 *
 * Tag ORDER follows the document's own `tags` array where it has one — that ordering is editorial
 * (discovery, identity, reads, build, assistant), and re-sorting it alphabetically would throw away
 * the one bit of curation the API author supplied. Tags used by an operation but absent from the
 * declaration follow in encounter order, and untagged operations land in a final group.
 */
export function groupByTag(doc) {
  const declared = Array.isArray(doc && doc.tags) ? doc.tags : []
  const descriptions = new Map()
  const order = []

  for (const tag of declared) {
    if (!tag || typeof tag.name !== 'string') continue
    if (!descriptions.has(tag.name)) order.push(tag.name)
    descriptions.set(tag.name, typeof tag.description === 'string' ? tag.description : '')
  }

  const buckets = new Map()
  for (const operation of listOperations(doc)) {
    const names = operation.tags.length > 0 ? operation.tags : [UNTAGGED]
    for (const name of names) {
      if (!buckets.has(name)) {
        buckets.set(name, [])
        if (!order.includes(name)) order.push(name)
      }
      buckets.get(name).push(operation)
    }
  }

  return order
    .filter((name) => buckets.has(name))
    .map((name) => ({
      name,
      label: name === UNTAGGED ? 'Other' : name,
      description: descriptions.get(name) || '',
      operations: buckets.get(name),
    }))
}

/**
 * The operations this console's "try it" is willing to send.
 *
 * GET only, on purpose: a POST here would be the console acting on the member's behalf, and the one
 * POST worth having (`/keys/revoke`) needs a signature this package cannot produce. Paths carrying
 * a template segment are excluded too — there is no UI for filling one, and offering an endpoint
 * that cannot actually be called would be a dead control.
 */
export function tryableOperations(doc) {
  return listOperations(doc).filter((op) => op.method === 'GET' && !op.path.includes('{'))
}

/** Query parameters an operation declares, for the hint under the query field. */
export function queryParameterNames(operation) {
  if (!operation || !Array.isArray(operation.parameters)) return []
  return operation.parameters
    .filter((p) => p.in === 'query' && typeof p.name === 'string')
    .map((p) => (p.required ? `${p.name} (required)` : p.name))
}

/** `info` fields, defaulted to empty strings so the header never renders `undefined`. */
export function documentInfo(doc) {
  const info = doc && typeof doc.info === 'object' && doc.info ? doc.info : {}
  return {
    title: typeof info.title === 'string' ? info.title : 'API',
    version: typeof info.version === 'string' ? info.version : '',
    summary: typeof info.summary === 'string' ? info.summary : '',
    openapi: doc && typeof doc.openapi === 'string' ? doc.openapi : '',
  }
}
