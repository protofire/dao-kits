const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')

const payrollAppId = namehash('payroll.aragonpm.eth')

module.exports = async (deployer, network, accounts, arts = null) => {
  if (arts != null) artifacts = arts // allow running outside

  const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS.sol')
  const PayrollKit = artifacts.require('PayrollKit')
  const Payroll = artifacts.require('Payroll')

  const ens = ENS.at(
    process.env.ENS ||
    '0x5f6f7e8cc7346a11ca2def8f827b7a0b612c56a1' // aragen's default ENS
  )

  console.log('Before apmAddr')

  const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))

  console.log('apmAddr', apmAddr)

  console.log('Deploying DAOFactory...')
  const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false })

  console.log('Deploying PayrollKit...')
  const kit = await PayrollKit.new(daoFactory.address, ens.address)

  console.log('Creating APM package for PayrollKit...')
  const apm = artifacts.require('APMRegistry').at(apmAddr)
  await apm.newRepoWithVersion('payroll-kit', accounts[0], [1, 0, 0], kit.address, 'ipfs:')

  console.log('PayrollKit:', kit.address)

  return kit.address
}
