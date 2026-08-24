import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { hostRef, resetHost } from './_host'

vi.mock('@fairwins/miniapp-sdk', () => ({ useMiniAppHost: () => hostRef.current }))

const copy = vi.hoisted(() => vi.fn().mockResolvedValue(true))
vi.mock('../useClipboard', () => ({
  default: () => ({ copied: false, error: null, copy }),
  useClipboard: () => ({ copied: false, error: null, copy }),
}))

import McpSetupPanel from '../McpSetupPanel'
import { buildMcpConfig, mcpConfigSnippet, TOKEN_PLACEHOLDER } from '../mcpConfig'

// Spec 095 — the MCP config generator.
//
// THE ONE THING THIS FILE EXISTS TO PROVE: the generated snippet carries a PLACEHOLDER where a
// token goes, never a real one. A config file gets pasted into editors, tickets and screen shares;
// a credential written into one by a generator is out of the member's hands the moment it is
// copied, and nothing here could get it back.

const A_REAL_TOKEN = 'fw1.eyJ2IjoxLCJhY2NvdW50IjoiMHhhYmMifQ.c2lnbmF0dXJlYnl0ZXM'

describe('buildMcpConfig', () => {
  it('puts the gateway address in the env and a placeholder where the token goes', () => {
    const config = buildMcpConfig('https://gw.example')
    expect(config.mcpServers.fairwins.env).toEqual({
      FAIRWINS_API_URL: 'https://gw.example',
      FAIRWINS_API_TOKEN: TOKEN_PLACEHOLDER,
    })
  })

  it('has no parameter through which a token could be interpolated', () => {
    // A second argument exists (the install path) and is deliberately not a credential slot.
    const snippet = mcpConfigSnippet('https://gw.example', { serverPath: '/opt/fairwins/server.js' })
    expect(snippet).toContain('/opt/fairwins/server.js')
    expect(snippet).toContain(TOKEN_PLACEHOLDER)
  })
})

describe('McpSetupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetHost()
  })

  it('renders a snippet that contains the placeholder and no real token', () => {
    const { container } = render(<McpSetupPanel baseUrl="https://gw.example" />)

    const snippet = container.querySelector('pre.aa-json')
    expect(snippet).toBeTruthy()
    expect(snippet.textContent).toContain('"mcpServers"')
    expect(snippet.textContent).toContain('https://gw.example')
    expect(snippet.textContent).toContain(TOKEN_PLACEHOLDER)
    expect(snippet.textContent).not.toContain(A_REAL_TOKEN)
    // Nothing that even looks like a token — the prefix would be the giveaway.
    expect(snippet.textContent).not.toMatch(/fw1\./)
  })

  it('copies exactly the snippet on screen, placeholder and all', async () => {
    const user = userEvent.setup()
    const { container } = render(<McpSetupPanel baseUrl="https://gw.example" />)

    await user.click(screen.getByRole('button', { name: /copy config/i }))

    const copied = copy.mock.calls[0][0]
    expect(copied).toBe(container.querySelector('pre.aa-json').textContent)
    expect(copied).toContain(TOKEN_PLACEHOLDER)
    expect(copied).not.toMatch(/fw1\./)
    expect(hostRef.current.toast.show).toHaveBeenCalledWith('MCP config copied.', 'success')
  })

  it('tells the member to fill the token in themselves, and why the file is a credential', () => {
    render(<McpSetupPanel baseUrl="https://gw.example" />)
    expect(screen.getByText(/The token slot is a placeholder/i)).toBeInTheDocument()
    expect(screen.getByText(/Treat the finished file as a credential/i)).toBeInTheDocument()
  })
})
