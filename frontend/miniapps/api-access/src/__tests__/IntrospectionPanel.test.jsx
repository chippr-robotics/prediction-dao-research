import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import IntrospectionPanel from '../IntrospectionPanel'
import { errorBody, jsonResponse, ME_READ, ME_UNREADABLE_MEMBERSHIP } from './_fixtures'

// Spec 095 — token introspection.
//
// THE RULE THAT MATTERS: membership is a THREE-state read, and the two non-`read` states are not
// "no membership". An unreadable tier rendered as tier 0, or as "not a member", is the exact
// failure the platform's estate rules exist to prevent — so the gateway's own reason is shown
// verbatim and the panel says out loud that this is not a statement about the account.

const TOKEN = 'fw1.eyJ2IjoxfQ.c2ln'

function stubFetch(handler) {
  const fetchMock = vi.fn(handler)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('IntrospectionPanel', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('cannot be run without a token, and says so', () => {
    render(<IntrospectionPanel baseUrl="https://gw.example" token="" />)
    expect(screen.getByRole('button', { name: /check this token/i })).toBeDisabled()
    expect(screen.getByText(/Paste a token in the connection card above/i)).toBeInTheDocument()
  })

  it('shows the account, key id, scopes and expiry the gateway reports', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(ME_READ))
    const user = userEvent.setup()
    render(<IntrospectionPanel baseUrl="https://gw.example" token={TOKEN} />)

    await user.click(screen.getByRole('button', { name: /check this token/i }))

    expect(await screen.findByText(ME_READ.account)).toBeInTheDocument()
    expect(screen.getByText('read:profile')).toBeInTheDocument()
    expect(screen.getByText('read:wagers')).toBeInTheDocument()
    // Active membership renders its tier.
    expect(screen.getByText(/Active — Gold \(tier 3\)/)).toBeInTheDocument()
    // The label is display-only and is marked as such, because it is not covered by the signature.
    expect(screen.getByText(/not signed/i)).toBeInTheDocument()

    expect(fetchMock.mock.calls[0][0]).toBe('https://gw.example/v1/member/me')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('renders an UNREADABLE membership as unreadable, verbatim — never as tier 0', async () => {
    stubFetch(async () => jsonResponse(ME_UNREADABLE_MEMBERSHIP))
    const user = userEvent.setup()
    render(<IntrospectionPanel baseUrl="https://gw.example" token={TOKEN} />)

    await user.click(screen.getByRole('button', { name: /check this token/i }))

    expect(await screen.findByText(/Could not be read — the membership contract could not be read; try again/))
      .toBeInTheDocument()
    expect(screen.getByText(/This is not a statement that the account has no membership/i)).toBeInTheDocument()
    expect(screen.queryByText(/tier 0/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Not active/i)).not.toBeInTheDocument()
  })

  it('states the honest revocation semantics rather than implying durability', async () => {
    stubFetch(async () => jsonResponse(ME_READ))
    const user = userEvent.setup()
    render(<IntrospectionPanel baseUrl="https://gw.example" token={TOKEN} />)

    await user.click(screen.getByRole('button', { name: /check this token/i }))

    expect(await screen.findByText(/Not revoked on this gateway/)).toBeInTheDocument()
    expect(screen.getByText(/do not survive a restart/i)).toBeInTheDocument()
  })

  it('shows the gateway’s error code when the token is refused', async () => {
    stubFetch(async () => jsonResponse(errorBody('token_expired', 'The grant’s expiresAt has passed.'), { status: 401 }))
    const user = userEvent.setup()
    render(<IntrospectionPanel baseUrl="https://gw.example" token={TOKEN} />)

    await user.click(screen.getByRole('button', { name: /check this token/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('401')
    expect(alert).toHaveTextContent('token_expired')
  })

  it('does not keep a previous key’s answer on screen when the token changes', async () => {
    stubFetch(async () => jsonResponse(ME_READ))
    const user = userEvent.setup()
    const { rerender } = render(<IntrospectionPanel baseUrl="https://gw.example" token={TOKEN} />)

    await user.click(screen.getByRole('button', { name: /check this token/i }))
    expect(await screen.findByText(ME_READ.account)).toBeInTheDocument()

    rerender(<IntrospectionPanel baseUrl="https://gw.example" token="fw1.another.key" />)
    expect(screen.queryByText(ME_READ.account)).not.toBeInTheDocument()
  })
})
