/**
 * In-app links inside an assistant reply (spec 095).
 *
 * The allow-list is the security property: a model can emit any string, so a path that is not a
 * route this app serves must stay inert text rather than become a link. It is still SHOWN — hiding
 * what the assistant said would be its own dishonesty — it simply is not pressable.
 */
import { describe, it, expect } from 'vitest'
import { extractInAppLinks } from '../lib/assistant/replyLinks'

const paths = (text) => extractInAppLinks(text).map((l) => l.path)

describe('extractInAppLinks', () => {
  it('finds the in-app paths the gateway prompt tells the assistant to use', () => {
    expect(paths('Lending lives at /wallet?tab=earn and the catalog is at /apps.')).toEqual([
      '/wallet?tab=earn',
      '/apps',
    ])
  })

  it('keeps a card deep link intact, hash and all', () => {
    expect(paths('Open /wallet?tab=settings#api-access to create one.')).toEqual([
      '/wallet?tab=settings#api-access',
    ])
  })

  it('trims sentence punctuation but not path characters', () => {
    expect(paths('Try /wallet?tab=trade&view=perps.')).toEqual(['/wallet?tab=trade&view=perps'])
    expect(paths('(see /privacy)')).toEqual(['/privacy'])
  })

  it('de-duplicates and preserves order', () => {
    expect(paths('/app then /wallet then /app again')).toEqual(['/app', '/wallet'])
  })

  it('ignores a path this app does not route — it stays plain text, never a link', () => {
    expect(paths('Go to /admin-secret or /etc/passwd or /not-a-route')).toEqual([])
  })

  it('never produces an off-origin link, whatever the model writes', () => {
    expect(paths('Visit https://evil.example/wallet?tab=earn now')).toEqual([])
    expect(paths('Visit //evil.example/app')).toEqual([])
  })

  it('handles empty and non-string input', () => {
    expect(extractInAppLinks('')).toEqual([])
    expect(extractInAppLinks(null)).toEqual([])
    expect(extractInAppLinks(42)).toEqual([])
  })
})
