import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import OpenApiExplorer from '../OpenApiExplorer'
import { MEMBER_API_DOC } from './_fixtures'

// Spec 095 — the explorer's three states, asserted at the component boundary so the "no list" half
// of the honest-failure rule can be checked without other cards' lists in the tree.
//
// THE RULE UNDER TEST: an endpoint roster that could not be read is not an API with no endpoints.
// A failed read must render an alert and NOTHING resembling a result.

const reload = vi.fn()

describe('OpenApiExplorer', () => {
  it('renders the loading state with no list', () => {
    render(<OpenApiExplorer state={{ status: 'loading', reload }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/Loading the API description/i)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('renders tags, methods, paths, summaries and required scopes when the document is read', () => {
    render(<OpenApiExplorer state={{ status: 'read', doc: MEMBER_API_DOC, reload }} />)

    expect(screen.getByText('FairWins Member API')).toBeInTheDocument()
    expect(screen.getByText('discovery')).toBeInTheDocument()
    expect(screen.getByText('/v1/member/me')).toBeInTheDocument()
    expect(screen.getByText('Introspect the presented token')).toBeInTheDocument()
    // The scope is shown next to the endpoint that needs it — that is what a member is looking for.
    expect(screen.getByText('read:wagers')).toBeInTheDocument()
    // And the one endpoint that needs none says so rather than showing a blank.
    expect(screen.getAllByText(/No scope required/i).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('shows an alert with a retry and NO list when nothing answered', async () => {
    const user = userEvent.setup()
    render(<OpenApiExplorer state={{ status: 'unavailable', reason: 'The gateway could not be reached.', reload }} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The API description could not be loaded.')
    expect(alert).toHaveTextContent('The gateway could not be reached.')
    // An empty roster is never rendered for a read that did not happen.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.queryByText('/v1/member/me')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(reload).toHaveBeenCalled()
  })

  it('names the gateway’s own error code when the gateway answered and said no', () => {
    render(<OpenApiExplorer state={{
      status: 'unavailable',
      httpStatus: 503,
      error: { code: 'member_api_unconfigured', reason: 'The member API is not enabled on this gateway.' },
      reload,
    }} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('503')
    expect(alert).toHaveTextContent('member_api_unconfigured')
    expect(alert).toHaveTextContent('The member API is not enabled on this gateway.')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('distinguishes "read, and it declares nothing" from "could not be read"', () => {
    render(<OpenApiExplorer state={{ status: 'read', doc: { openapi: '3.1.0', info: {}, paths: {} }, reload }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/declares no endpoints/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
