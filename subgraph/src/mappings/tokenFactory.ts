import { TokenCreated } from '../../generated/TokenFactory/TokenFactory'
import { Token } from '../../generated/schema'

// Spec 028 (issue #761): index TokenFactory.TokenCreated so token discovery and an issuer's admin list work
// without an eth_getLogs scan. Network-scoped by deployment. On subgraph-less networks (Mordor/ETC) the
// frontend reads the factory registry over RPC instead. The mapping makes no contract calls.
export function handleTokenCreated(event: TokenCreated): void {
  const t = new Token(event.params.token.toHexString())
  t.registryId = event.params.id
  t.standard = event.params.standard
  t.tokenAddress = event.params.token
  t.issuer = event.params.issuer
  t.name = event.params.name
  t.symbol = event.params.symbol
  t.createdAt = event.block.timestamp
  t.createdTxHash = event.transaction.hash
  t.save()
}
