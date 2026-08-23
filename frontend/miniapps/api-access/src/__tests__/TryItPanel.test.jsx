import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import TryItPanel from '../TryItPanel'
import { errorBody, jsonResponse, MEMBER_API_DOC } from './_fixtures'

// Spec 095 — "try a read".
//
// THE POINT: an error body is a RESULT, not a failure. `403 insufficient_scope` answers the
// member's question exactly — the key works and lacks a scope — and rendering it as "request
// failed" would throw away the only useful part of the response. Distinguishing that from "nothing
// answered" is the whole reason this panel has three outcomes instead of two.

const READ_SPEC = { status: 'read', doc: MEMBER_API_DOC, reload: vi.fn() }
const TOKEN = 'fw1.eyJ2IjoxfQ.c2ln'

function stubFetch(handler) {
  const fetchMock = vi.fn(handler)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('TryItPanel', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('offers only the GET endpoints the loaded document declares', () => {
    render(<TryItPanel baseUrl="https://gw.example" token={TOKEN} spec={READ_SPEC} />)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual([
      'GET /v1/member/openapi.json',
      'GET /v1/member/me',
      'GET /v1/member/wagers',
    ])
    // The POST the document declares is deliberately absent — signing stays with the member.
    expect(options.some((o) => o.includes('intents/build'))).toBe(false)
  })

  it('does not offer a picker at all when the description was not read', () => {
    render(<TryItPanel baseUrl="https://gw.example" token={TOKEN} spec={{ status: 'unavailable', reason: 'nope', reload: vi.fn() }} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/The endpoint list comes from the API description above/i)
  })

  it('sends the chosen endpoint with the query string and the token in a header', async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ account: '0xabc', chains: {} }))
    const user = userEvent.setup()
    render(<TryItPanel baseUrl="https://gw.example" token={TOKEN} spec={READ_SPEC} />)

    await user.selectOptions(screen.getByLabelText(/endpoint/i), 'GET /v1/member/wagers')
    await user.type(screen.getByLabelText(/query string/i), 'chainId=137')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    await screen.findByText(/"chains": \{\}/)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gw.example/v1/member/wagers?chainId=137')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(url).not.toContain(TOKEN)
  })

  it('pretty-prints a successful body', async () => {
    stubFetch(async () => jsonResponse({ account: '0xabc' }))
    const user = userEvent.setup()
    const { container } = render(<TryItPanel baseUrl="https://gw.example" token={TOKEN} spec={READ_SPEC} />)

    await user.click(screen.getByRole('button', { name: /^send$/i }))

    const body = await screen.findByText(/"account": "0xabc"/)
    expect(body).toBeInTheDocument()
    expect(container.querySelector('.aa-json')).toBeTruthy()
  })

  it('renders an error body honestly — status, code, the gateway’s reason, and the raw body', async () => {
    stubFetch(async () => jsonResponse(
      errorBody('insufficient_scope', 'this key does not carry the "read:wagers" scope; mint a key that includes it'),
      { status: 403 },
    ))
    const user = userEvent.setup()
    render(<TryItPanel baseUrl="https://gw.example" token={TOKEN} spec={READ_SPEC} />)

    await user.selectOptions(screen.getByLabelText(/endpoint/i), 'GET /v1/member/wagers')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('403')
    expect(alert).toHaveTextContent('insufficient_scope')
    expect(alert).toHaveTextContent('mint a key that includes it')
    // The raw body is shown too — a member comparing against the spec needs the bytes.
    expect(screen.getByText(/"code": "insufficient_scope"/)).toBeInTheDocument()
    // And it is NOT reported as an outage.
    expect(screen.queryByText('No answer.')).not.toBeInTheDocument()
  })

  it('surfaces a rate limit with its Retry-After', async () => {
    stubFetch(async () => jsonResponse(errorBody('quota_exceeded', 'slow down'), {
      status: 429,
      headers: { 'Retry-After': '30' },
    }))
    const user = userEvent.setup()
    render(<TryItPanel baseUrl="https://gw.example" token={TOKEN} spec={READ_SPEC} />)

    await user.click(screen.getByRole('button', { name: /^send$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('retry after 30s')
  })

  it('reports "no answer" separately when nothing replied, and shows no body', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    const user = userEvent.setup()
    const { container } = render(<TryItPanel baseUrl="https://gw.example" token={TOKEN} spec={READ_SPEC} />)

    await user.click(screen.getByRole('button', { name: /^send$/i }))

    expect(await screen.findByText('No answer.')).toBeInTheDocument()
    expect(container.querySelector('.aa-json')).toBeNull()
  })

  it('says a scoped endpoint needs a token, and stays quiet for the public one', async () => {
    const user = userEvent.setup()
    render(<TryItPanel baseUrl="https://gw.example" token="" spec={READ_SPEC} />)

    // The default selection is the public openapi.json, which needs nothing.
    expect(screen.queryByText(/This endpoint needs a token/i)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/endpoint/i), 'GET /v1/member/me')
    expect(screen.getByText(/This endpoint needs a token/i)).toBeInTheDocument()
  })
})
