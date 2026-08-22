/**
 * AssistantPreferencesPanel (spec 095) — the opt-in switch and the on-device memory controls.
 *
 * The summary line is the assertion that matters most: a collapsed card that says "Off" without
 * saying what off MEANS leaves the member to assume. "Off — nothing is sent" is a claim the code
 * has to keep, and this pins it to the actual preference rather than to a label.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let walletState

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => walletState }))

import AssistantPreferencesPanel from '../components/account/AssistantPreferencesPanel'
import { __resetAssistantPrefsForTests, isAssistantEnabled, isMemoryRetained } from '../lib/assistant/assistantPrefs'
import { memoryCount, saveMemory } from '../lib/assistant/memoryStore'
import { listClientRecordsAllChains } from '../data/ledger/ledgerClientStore'

const ACCOUNT = '0x' + '4'.repeat(40)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  __resetAssistantPrefsForTests()
  walletState = { address: ACCOUNT, chainId: 137, isConnected: true }
})

function renderPanel() {
  return render(<AssistantPreferencesPanel />)
}

/** The accordion header. Its accessible name is the title plus the collapsed summary. */
const header = () => screen.getByRole('button', { name: /^assistant/i })
const openCard = () => fireEvent.click(header())

it('is OFF by default and says what off means', () => {
  renderPanel()
  expect(header()).toHaveTextContent('Off — nothing is sent')
})

it('turns on, records a durable audit entry, and updates the summary honestly', () => {
  renderPanel()
  openCard()
  fireEvent.click(screen.getByTestId('assistant-enable-switch'))

  expect(isAssistantEnabled(ACCOUNT)).toBe(true)
  expect(screen.getByTestId('assistant-enable-switch')).toHaveAttribute('aria-checked', 'true')

  // A preference this consequential is not allowed to exist only as a toast.
  const records = listClientRecordsAllChains(ACCOUNT).filter((r) => r.kind === 'assistant_enabled')
  expect(records).toHaveLength(1)
  expect(JSON.stringify(records[0])).not.toContain('fw1.')
})

it('shows a live memory count and clears it', () => {
  saveMemory(ACCOUNT, [
    { role: 'user', content: 'hello', at: 1 },
    { role: 'assistant', content: 'hi', at: 2 },
  ])
  renderPanel()
  openCard()

  expect(screen.getByTestId('assistant-memory-count')).toHaveTextContent('2 messages stored on this device')
  fireEvent.click(screen.getByRole('button', { name: /clear conversation memory/i }))
  expect(memoryCount(ACCOUNT)).toBe(0)
  expect(screen.getByTestId('assistant-memory-count')).toHaveTextContent('Nothing stored on this device')
})

it('turning retention off also forgets what was already remembered', () => {
  saveMemory(ACCOUNT, [{ role: 'user', content: 'hello', at: 1 }])
  renderPanel()
  openCard()

  fireEvent.click(screen.getByTestId('assistant-memory-switch'))
  expect(isMemoryRetained(ACCOUNT)).toBe(false)
  // "Stop remembering" that silently kept the part it had already remembered would be a lie.
  expect(memoryCount(ACCOUNT)).toBe(0)
})

it('discloses what leaves the device and links to the privacy policy', () => {
  renderPanel()
  openCard()

  expect(screen.getByText(/while the assistant is off, nothing is sent/i)).toBeInTheDocument()
  expect(screen.getByText(/never signs and never submits/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy')
})

it('asks for a wallet rather than pretending to hold a preference', () => {
  walletState = { address: null, chainId: 137, isConnected: false }
  renderPanel()
  expect(header()).toHaveTextContent('Connect a wallet')
})
