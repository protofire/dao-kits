const deploy_ens = require('@aragon/os/scripts/deploy-beta-ens.js')
const deploy_apm = require('@aragon/os/scripts/deploy-beta-apm.js')
const deploy_id = require('@aragon/id/scripts/deploy-beta-aragonid.js')
const deploy_kit = require('@aragon/kits-beta/scripts/deploy_kit.js')

module.exports = async (callback) => {
  console.log('Deploying Multisig Kit')

  if (process.argv.length < 5) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy.js')
  }
  // get network
  const network = process.argv[4]

  // ENS
  const { ens } = await deploy_ens(null, { artifacts })

  // APM
  await deploy_apm(null, {artifacts, ensAddress: ens.address })

  // aragonID
  await deploy_id(null, { artifacts, ensAddress: ens.address })

  await deploy_kit(null, { artifacts, kitName: 'MultisigKit', network: network, ensAddress: ens.address })
}
