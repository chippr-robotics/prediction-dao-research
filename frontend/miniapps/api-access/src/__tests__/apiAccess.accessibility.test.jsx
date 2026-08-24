import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import { hostRef, resetHost } from './_host'
import { jsonResponse, ME_UNREADABLE_MEMBERSHIP, MEMBER_API_DOC } from './_fixtures'

vi.mock('@fairwins/miniapp-sdk', () => ({ useMiniAppHost: () => hostRef.current }))

import ApiAccessConsole from '../ApiAccessConsole'
import IntrospectionPanel from '../IntrospectionPanel'
import OpenApiExplorer from '../OpenApiExplorer'

// Spec 095 — axe accessibility (WCAG 2.1 AA) over the API Access console. Picked up by the gating
// CI step `npm test -- --run accessibility.test`.
//
// Both the POPULATED and the FAILED renders are audited: the failure states are alerts and notices
// a member has to be able to reach, and a panel that renders almost nothing passes an audit by
// having almost no markup in it.

function stubFetch(handler) {
  vi.stubGlobal('fetch', vi.fn(handler))
}

describe('API Access accessibility (WCAG 2.1 AA)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetHost()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('the whole console, with the API description loaded, has no axe violations', async () => {
    stubFetch(async () => jsonResponse(MEMBER_API_DOC))
    const { container } = render(<ApiAccessConsole />)
    await screen.findByText('FairWins Member API')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('the whole console, with the gateway unreachable, has no axe violations', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    const { container } = render(<ApiAccessConsole />)
    await screen.findByText('The API description could not be loaded.')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('the endpoint roster has no axe violations', async () => {
    const { container } = render(
      <OpenApiExplorer state={{ status: 'read', doc: MEMBER_API_DOC, reload: vi.fn() }} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('token introspection, including the unreadable membership state, has no axe violations', async () => {
    stubFetch(async () => jsonResponse(ME_UNREADABLE_MEMBERSHIP))
    const user = userEvent.setup()
    const { container } = render(<IntrospectionPanel baseUrl="https://gw.example" token="fw1.a.b" />)
    await user.click(screen.getByRole('button', { name: /check this token/i }))
    await screen.findByText(/Could not be read/)
    expect(await axe(container)).toHaveNoViolations()
  })
})
