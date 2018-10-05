const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS')
const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')
const PublicResolver = artifacts.require('@aragon/os/contracts/lib/ens/PublicResolver')
const Repo = artifacts.require('@aragon/os/contracts/apm/Repo')

const PayrollKit = artifacts.require('@aragon/kits-payroll/contracts/PayrollKit')
const Payroll = artifacts.require('@aragon/future-apps-payroll/contracts/Payroll')

// Utils
const payrollAppId = namehash('payroll.aragonpm.eth')
const payrollKitEnsNode = namehash('payroll-kit.aragonpm.eth')
const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const createdPayrollDao = receipt => receipt.logs.filter(x => x.event == 'DeployInstance')[0].args.dao
const createdPayrollId = receipt => receipt.logs.filter(x => x.event == 'StartPayroll')[0].args.payroId
const installedApp = (receipt, appId) => receipt.logs.filter(x => x.event == 'InstalledApp' && x.args.appId === appId)[0].args.appProxy

module.exports = async (deployer, network, accounts) => {
  const root = accounts[0]

  const ens = ENS.at(
    process.env.ENS ||
    '0x5f6f7e8cc7346a11ca2def8f827b7a0b612c56a1' // aragen's default ENS
  )
  const payrollKitRepo = Repo.at(
    await PublicResolver.at(
      await ens.resolver(payrollKitEnsNode)
    ).addr(payrollKitEnsNode)
  )
  // Contract address is second return of Repo.getLatest()
  const payrollKit = PayrollKit.at((await payrollKitRepo.getLatest())[1])

  const minimeFac = await MiniMeTokenFactory.new()
  const denominationToken = await MiniMeToken.new(
    '0x00',
    '0x00',
    '0x00',
    'USD Dolar',
    18,
    'USD',
    true
  )

  const ppf = artifacts.require('PPF').new()

  const SECONDS_IN_A_YEAR = 31557600 // 365.25 days
  const RATE_EXPIRY_TIME = 1000

  // Create DAO with Payroll installed
  console.log('Creating Payroll DAO...')
  const payrollDaoReceipt = await payrollKit.newInstance(
    root,
    root,
    SECONDS_IN_A_YEAR,
    denominationToken,
    ppf,
    RATE_EXPIRY_TIME
  )
  const createtDaoAddr = createdPayrollDao(payrollDaoReceipt)
  const createdAppAddr = installedApp(payrollDaoReceipt, payrollAppId)

  // TODO: Create some sample data

  console.log('===========')
  console.log('Payroll demo DAO set up!')
  console.log('Payroll DAO:', payrollDaoAddr)
  console.log("Payroll DAO's Payroll app:", payrollAppAddr)
  console.log('Payroll Token:', denominationToken.address)
}
