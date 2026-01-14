import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

describe('sync-frontend-contracts script', () => {
  it('updates a contracts.js file from a deployment json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdao-sync-'))

    const contractsFile = path.join(tmpDir, 'contracts.js')
    const deploymentFile = path.join(tmpDir, 'deployment.json')

    fs.writeFileSync(
      contractsFile,
      `export const DEPLOYED_CONTRACTS = {\n  deployer: '0x0000000000000000000000000000000000000001',\n  welfareRegistry: '0x0000000000000000000000000000000000000002',\n}\n\n/** sentinel */\nexport function getContractAddress(contractName) {\n  const envKey = \`VITE_\${contractName.toUpperCase()}_ADDRESS\`\n  const envAddress = import.meta.env?.[envKey]\n  if (envAddress) return envAddress\n  return DEPLOYED_CONTRACTS[contractName]\n}\n`
    )

    fs.writeFileSync(
      deploymentFile,
      JSON.stringify(
        {
          network: 'mordor',
          chainId: 63,
          deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
          contracts: {
            tieredRoleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8',
            welfareRegistry: '0x31c8028D872e8c994A1b505A082ABD1B367673e7',
            proposalRegistry: '0xBB402Bc027eB1534B73FB41b5b3040B4a803b525',
            marketFactory: '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac',
            privacyCoordinator: '0x99C4CA1dB381C91c3Ad350bCE79fC8B661671F32',
            oracleResolver: '0x8DfE774E72482aeDF5eaE6A43E9F181343E42E86',
            ragequitModule: '0xc6E2a7a5A12d4Dfb290ef3934F6Ed7fF3C2496bc',
            futarchyGovernor: '0xD379002D90a38245dC99D9dd7BE430Ab9C0B3e54',
            tokenMintFactory: '0x8D4485C3bDb16dc782403B36e8BC2524000C54DB',
            daoFactory: '0x89E2bEC5f1AAf40c8232D50c53e6048E2386567a'
          }
        },
        null,
        2
      )
    )

    const scriptPath = path.resolve(process.cwd(), '../scripts/sync-frontend-contracts.js')

    execFileSync('node', [
      scriptPath,
      '--deploymentFile',
      deploymentFile,
      '--contractsFile',
      contractsFile
    ])

    const updated = read(contractsFile)

    expect(updated).toContain("deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1'")
    expect(updated).toContain("welfareRegistry: '0x31c8028D872e8c994A1b505A082ABD1B367673e7'")

    // Inserted keys
    expect(updated).toContain("tieredRoleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8'")
    expect(updated).toContain("roleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8'")
    expect(updated).toContain("roleManagerCore: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8'")

    // Factory contracts
    expect(updated).toContain("tokenMintFactory: '0x8D4485C3bDb16dc782403B36e8BC2524000C54DB'")
    expect(updated).toContain("daoFactory: '0x89E2bEC5f1AAf40c8232D50c53e6048E2386567a'")
  })
})
