import { describe, it, expect, vi, beforeEach } from 'vitest'

// generatePoolProof (spec 034) wires the self-hosted circuit artifacts through to the Semaphore
// prover — a confirmed root cause of the pool "approve does nothing" bug was proof generation
// depending on a live, unpinned third-party CDN fetch for every join/vote/claim. This locks the
// wiring in place: the vendored public/semaphore/* filenames must reach generateProof exactly.

const generateProof = vi.fn().mockResolvedValue({
  merkleTreeDepth: 16,
  merkleTreeRoot: 1n,
  nullifier: 2n,
  message: 3n,
  scope: 4n,
  points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
})
// A regular function (not an arrow function) so `new Group(...)` inside generatePoolProof works —
// arrow functions can't be used as constructors.
const GroupCtor = vi.fn().mockImplementation(function (members) {
  this.members = members
})

vi.mock('@semaphore-protocol/group', () => ({ Group: GroupCtor }))
vi.mock('@semaphore-protocol/proof', () => ({ generateProof }))

describe('generatePoolProof', () => {
  beforeEach(() => {
    generateProof.mockClear()
    GroupCtor.mockClear()
  })

  it('passes the self-hosted depth-16 circuit artifacts to generateProof (not the default CDN)', async () => {
    const { generatePoolProof } = await import('../lib/pools/semaphoreProof')
    await generatePoolProof({ identity: 'id', memberCommitments: [1n, 2n], message: 1n, scope: 9n })

    expect(generateProof).toHaveBeenCalledTimes(1)
    const [, , , , depthArg, artifactsArg] = generateProof.mock.calls[0]
    expect(depthArg).toBe(16)
    expect(artifactsArg).toEqual({
      wasm: '/semaphore/semaphore-16.06df3146.wasm',
      zkey: '/semaphore/semaphore-16.948763c7.zkey',
    })
  })

  it('falls back to the library default (no self-hosted override) for a non-16 depth', async () => {
    const { generatePoolProof } = await import('../lib/pools/semaphoreProof')
    await generatePoolProof({ identity: 'id', memberCommitments: [1n], message: 1n, scope: 9n, depth: 20 })

    const [, , , , depthArg, artifactsArg] = generateProof.mock.calls[0]
    expect(depthArg).toBe(20)
    expect(artifactsArg).toBeUndefined()
  })

  it('maps the returned proof to the contract SemaphoreProof tuple shape', async () => {
    const { generatePoolProof } = await import('../lib/pools/semaphoreProof')
    const result = await generatePoolProof({ identity: 'id', memberCommitments: [1n], message: 1n, scope: 9n })
    expect(result).toEqual({
      merkleTreeDepth: 16,
      merkleTreeRoot: 1n,
      nullifier: 2n,
      message: 3n,
      scope: 4n,
      points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    })
  })
})
