/**
 * MCP stdio transport (spec 095).
 *
 * The MCP stdio transport is NEWLINE-DELIMITED JSON: exactly one JSON-RPC message per line, UTF-8,
 * and no `Content-Length` framing (that belongs to LSP, which MCP is often mistaken for). A message
 * therefore may not contain a raw newline — `JSON.stringify` never emits one inside a string, so
 * writing `JSON.stringify(msg) + '\n'` is the whole of the encoder.
 *
 * ONE RULE ABOVE ALL OTHERS: **stdout carries the protocol and nothing else.** A stray
 * `console.log` — a banner, a warning, a debug line — lands in the middle of the stream and the
 * client sees a parse error on a message it never sent. Everything this server has to say to a
 * human goes to stderr, which clients surface as server logs.
 *
 * SHUTDOWN. When stdin ends the client has gone; the server closes cleanly rather than waiting on a
 * pipe that will never speak again. In-flight requests are still allowed to finish and write their
 * answers, because a client that closed the write side may still be reading.
 */

/** Refuse a single line longer than this rather than buffering without bound. */
const MAX_LINE_BYTES = 4 * 1024 * 1024

/**
 * @param {{
 *   handle: (message: object, ctx: object) => Promise<object|null>,
 *   parse: (text: string) => object,
 *   onParseError: (err: unknown) => object,
 *   stdin?: NodeJS.ReadableStream,
 *   stdout?: NodeJS.WritableStream,
 *   log?: (message: string) => void,
 * }} deps
 * @returns {{ done: Promise<void>, close: () => void }}
 */
export function startStdioTransport({
  handle,
  parse,
  onParseError,
  stdin = process.stdin,
  stdout = process.stdout,
  log = (m) => process.stderr.write(`${m}\n`),
}) {
  let buffer = ''
  let closed = false
  // Answers are written in the order the requests arrived. Interleaving would be legal JSON-RPC —
  // every response carries its id — but ordered output is far easier to read in a client's log, and
  // costs nothing at this traffic level.
  let queue = Promise.resolve()

  const write = (message) => {
    if (closed) return
    stdout.write(`${JSON.stringify(message)}\n`)
  }

  const dispatch = (line) => {
    queue = queue
      .then(async () => {
        let decoded
        try {
          decoded = parse(line)
        } catch (err) {
          write(onParseError(err))
          return
        }
        const response = await handle(decoded, {})
        if (response) write(response)
      })
      .catch((err) => {
        // Reaching here means the handler itself threw, which it is written not to do. Report it on
        // stderr; a broken pipe must not take the process down mid-write.
        log(`[fairwins-mcp] transport error: ${err?.message ?? String(err)}`)
      })
  }

  stdin.setEncoding?.('utf8')

  const onData = (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) dispatch(line)
    }
    if (buffer.length > MAX_LINE_BYTES) {
      log(`[fairwins-mcp] discarding an unterminated message over ${MAX_LINE_BYTES} bytes`)
      buffer = ''
    }
  }

  const done = new Promise((resolve) => {
    const finish = () => {
      if (closed) return
      closed = true
      stdin.off?.('data', onData)
      resolve()
    }
    stdin.on('data', onData)
    // stdin ending is the client hanging up: drain whatever is queued, then resolve.
    stdin.on('end', () => queue.then(finish, finish))
    stdin.on('close', () => queue.then(finish, finish))
    stdin.on('error', (err) => {
      log(`[fairwins-mcp] stdin error: ${err?.message ?? String(err)}`)
      finish()
    })
  })

  return {
    done,
    close() {
      closed = true
      stdin.off?.('data', onData)
      stdin.pause?.()
    },
  }
}
