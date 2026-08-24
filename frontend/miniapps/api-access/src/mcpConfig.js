/**
 * The MCP client config snippet (spec 095).
 *
 * THE PLACEHOLDER IS THE WHOLE DESIGN. This console holds a real token in memory while the member
 * is using it, and it would be trivially easy to paste that token into the snippet "so it just
 * works". It never does. The snippet is copied to a clipboard, pasted into a config file, and
 * frequently into a chat window or a screen share on the way — a generated file is exactly the
 * wrong place for a bearer credential, and once it is in one, nothing here can get it back out.
 *
 * So the token slot carries `TOKEN_PLACEHOLDER` and the panel tells the member to fill it in
 * themselves, in the file, where it belongs.
 */

/** The literal that stands where a token would go. Deliberately obviously not a token. */
export const TOKEN_PLACEHOLDER = '<paste your FairWins API token here>'

/** The default install path suggested in the snippet, stated as a path the member must correct. */
export const DEFAULT_SERVER_PATH = '/path/to/fairwins-mcp-server/src/server.js'

/**
 * Build the `mcpServers` object an MCP client (Claude Desktop, Claude Code, and the others that
 * share the shape) expects.
 *
 * @param {string} baseUrl the gateway address the member saved
 * @param {{serverPath?: string}} [options]
 */
export function buildMcpConfig(baseUrl, options = {}) {
  const serverPath = options.serverPath || DEFAULT_SERVER_PATH
  return {
    mcpServers: {
      fairwins: {
        command: 'node',
        args: [serverPath],
        env: {
          FAIRWINS_API_URL: String(baseUrl || ''),
          FAIRWINS_API_TOKEN: TOKEN_PLACEHOLDER,
        },
      },
    },
  }
}

/** The snippet as text, exactly as the copy button puts it on the clipboard. */
export function mcpConfigSnippet(baseUrl, options) {
  return `${JSON.stringify(buildMcpConfig(baseUrl, options), null, 2)}\n`
}
