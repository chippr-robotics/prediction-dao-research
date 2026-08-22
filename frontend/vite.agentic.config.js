import { mergeConfig } from 'vite'
import base from './vite.config.js'

/* Written by scripts/ui/capture-agentic-access.mjs; deleted when it exits. Aliases the WALLET and
   the MEMBERSHIP READ so scenarios can pose states; the spec-095 components, their CSS, the
   accordion/sheet shells and the theme tokens under review stay real. */
export default async (env) => {
  const resolved = typeof base === 'function' ? await base(env) : base
  return mergeConfig(resolved, {
    resolve: {
      alias: [
        { find: /^.*hooks\/useWalletManagement$/, replacement: '/src/dev/__stubWallet.js' },
        { find: /^.*hooks\/useRoleDetails$/, replacement: '/src/dev/__stubRoleDetails.js' },
      ],
    },
  })
}
