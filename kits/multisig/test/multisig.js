const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const getBlock = require('@aragon/test-helpers/block')(web3)
//const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const getBalance = require('@aragon/test-helpers/balance')(web3)
const namehash = require('eth-ens-namehash').hash
const keccak256 = require('js-sha3').keccak_256

const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')

const Voting = artifacts.require('Voting')
const TokenManager = artifacts.require('TokenManager')

const apps = ['finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).appName))

const getContract = name => artifacts.require(name)
const getKit = (indexObj, kitName) => getContract(kitName).at(indexObj.networks['devnet'].kits.filter(x => x.name == kitName)[0].address)
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const getEventResult = (receipt, event, param) => receipt.logs.filter(l => l.event == event)[0].args[param]
const getVoteId = (receipt) => {
    const logs = receipt.receipt.logs.filter(
        l =>
            l.topics[0] == web3.sha3('StartVote(uint256)')
    )
    return web3.toDecimal(logs[0].topics[1])
}
const getAppProxy = (receipt, id) => receipt.logs.filter(l => l.event == 'InstalledApp' && l.args.appId == id)[0].args.appProxy


contract('Multisig Kit', accounts => {
    const ETH = '0x0'
    let daoAddress, tokenAddress
    let kit, receiptInstance, voting, tokenManager
    const owner = process.env.OWNER //'0x1f7402f55e142820ea3812106d0657103fc1709e'
    const signer1 = accounts[6]
    const signer2 = accounts[7]
    const signer3 = accounts[8]
    const nonHolder = accounts[9]
    let indexObj = require('../index_local.js')

    const signers = [signer1, signer2, signer3]
    const neededSignatures = 2
    const multisigSupport = new web3.BigNumber(10 ** 18).times(neededSignatures).dividedToIntegerBy(signers.length).minus(1)

    before(async () => {
        // transfer some ETH to other accounts
        await web3.eth.sendTransaction({ from: owner, to: signer1, value: web3.toWei(1, 'ether') })
        await web3.eth.sendTransaction({ from: owner, to: signer2, value: web3.toWei(1, 'ether') })
        await web3.eth.sendTransaction({ from: owner, to: signer3, value: web3.toWei(1, 'ether') })
        await web3.eth.sendTransaction({ from: owner, to: nonHolder, value: web3.toWei(1, 'ether') })

        // create Multisig Kit
        kit = await getKit(indexObj, 'MultisigKit')
        // create Token
        const receiptToken = await kit.newToken('MultisigToken', 'MTT')
        tokenAddress = getEventResult(receiptToken, 'DeployToken', 'token')
        // create Instance
        receiptInstance = await kit.newInstance('MultisigDao-' + Math.random() * 1000, signers, neededSignatures)
        daoAddress = getEventResult(receiptInstance, 'DeployInstance', 'dao')
        // generated Voting app
        const votingProxyAddress = getAppProxy(receiptInstance, appIds[3])
        voting = Voting.at(votingProxyAddress)
        // generated TokenManager app
        const tokenManagerProxyAddress = getAppProxy(receiptInstance, appIds[1])
        tokenManager = TokenManager.at(tokenManagerProxyAddress)
    })

    context('Creating a DAO and signing', () => {

        it('creates and initializes a DAO with its Token', async() => {
            assert.notEqual(tokenAddress, '0x0', 'Token not generated')
            assert.notEqual(daoAddress, '0x0', 'Instance not generated')
            assert.equal((await voting.supportRequiredPct()).toString(), multisigSupport.toString())
            assert.equal((await voting.minAcceptQuorumPct()).toString(), multisigSupport.toString())
            const maxUint64 = new web3.BigNumber(2).pow(64).minus(1)
            // TODO assert.equal((await voting.voteTime()).toString(), maxUint64.toString())
            // check that it's initialized and can not be initialized again
            try {
                await voting.initialize(tokenAddress, 1e18, 1e18, 1000)
            } catch (err) {
                assert.equal(err.receipt.status, 0, "It should have thrown")
                return
            }
            assert.isFalse(true, "It should have thrown")
        })

        it('fails trying to modify support threshold directly', async () => {
            try {
                await voting.changeSupportRequiredPct(multisigSupport.add(1), { from: owner })
            } catch (err) {
                assert.equal(err.receipt.status, 0, "It should have thrown")
                return
            }
            assert.isFalse(true, "It should have thrown")
        })

        it('changes support threshold thru voting', async () => {
            const action1 = { to: voting.address, calldata: voting.contract.changeSupportRequiredPct.getData(multisigSupport.add(1)) }
            const script1 = encodeCallScript([action1])
            const action2 = { to: voting.address, calldata: voting.contract.newVote.getData(script1, 'metadata', true, true) }
            const script2 = encodeCallScript([action2])
            const r1 = await tokenManager.forward(script2, { from: signer1 })
            const voteId1 = getVoteId(r1)
            await voting.vote(voteId1, true, true, { from: signer1 })
            await voting.vote(voteId1, true, true, { from: signer2 })
            const supportThreshold1 = await voting.supportRequiredPct()
            assert.equal(supportThreshold1.toString(), multisigSupport.add(1).toString(), 'Support should have changed')
            const vote = await voting.getVote(voteId1)
            assert.equal(vote[5].toString(), multisigSupport.toString(), 'Support for previous vote should not have changed')

            // back to original value
            const action3 = { to: voting.address, calldata: voting.contract.changeSupportRequiredPct.getData(multisigSupport) }
            const script3 = encodeCallScript([action3])
            const action4 = { to: voting.address, calldata: voting.contract.newVote.getData(script3, 'metadata', true, true) }
            const script4 = encodeCallScript([action4])
            const r2 = await tokenManager.forward(script4, { from: signer1 })
            const voteId2 = getVoteId(r2)
            await voting.vote(voteId2, true, true, { from: signer1 })
            await voting.vote(voteId2, true, true, { from: signer2 })
            await voting.vote(voteId2, true, true, { from: signer3 })
            const supportThreshold2 = await voting.supportRequiredPct()
            assert.equal(supportThreshold2.toString(), multisigSupport.toString(), 'Support should have changed again')
        })

        context('creating vote', () => {
            let voteId = {}
            let executionTarget = {}, script

            beforeEach(async () => {
                executionTarget = await getContract('ExecutionTarget').new()
                const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
                script = encodeCallScript([action, action])
                const action2 = { to: voting.address, calldata: voting.contract.newVote.getData(script, 'metadata', true, true) }
                const script2 = encodeCallScript([action2])
                const r = await tokenManager.forward(script2, { from: signer1 })
                voteId = getVoteId(r)
            })

            it('has correct state', async() => {
                const [isOpen, isExecuted, creator, startDate, snapshotBlock, requiredSupport, minQuorum, y, n, totalVoters, execScript] = await voting.getVote(voteId)

                assert.isTrue(isOpen, 'vote should be open')
                assert.isFalse(isExecuted, 'vote should be executed')
                assert.equal(creator, tokenManager.address, 'creator should be correct')
                assert.equal(snapshotBlock, await getBlockNumber() - 1, 'snapshot block should be correct')
                assert.equal(requiredSupport.toString(), multisigSupport.toString(), 'min quorum should be app min quorum')
                assert.equal(minQuorum.toString(), multisigSupport.toString(), 'min quorum should be app min quorum')
                assert.equal(y, 0, 'initial yea should be 0')
                assert.equal(n, 0, 'initial nay should be 0')
                assert.equal(totalVoters.toString(), signers.length, 'total voters should be number of signers')
                assert.equal(execScript, script, 'script should be correct')
                assert.equal(await voting.getVoteMetadata(voteId), 'metadata', 'should have returned correct metadata')
            })

            it('holder can vote', async () => {
                await voting.vote(voteId, false, true, { from: signer2 })
                const state = await voting.getVote(voteId)

                assert.equal(state[8].toString(), 1, 'nay vote should have been counted')
            })

            it('holder can modify vote', async () => {
                await voting.vote(voteId, true, true, { from: signer2 })
                await voting.vote(voteId, false, true, { from: signer2 })
                await voting.vote(voteId, true, true, { from: signer2 })
                const state = await voting.getVote(voteId)

                assert.equal(state[7].toString(), 1, 'yea vote should have been counted')
                assert.equal(state[8], 0, 'nay vote should have been removed')
            })

            it('throws when non-holder votes', async () => {
                try {
                    await voting.vote(voteId, true, true, { from: nonHolder })
                } catch (err) {
                    assert.equal(err.receipt.status, 0, "It should have thrown")
                    return
                }
                assert.isFalse(true, "It should have thrown")
            })

            it('automatically executes if vote is approved by enough signers', async () => {
                await voting.vote(voteId, true, true, { from: signer2 })
                await voting.vote(voteId, true, true, { from: signer1 })
                assert.equal((await executionTarget.counter()).toString(), 2, 'should have executed result')
            })

            it('cannot execute vote if not enough signatures', async () => {
                await voting.vote(voteId, true, true, { from: signer1 })
                assert.equal(await executionTarget.counter(), 0, 'should have not executed result')
                try {
                    await voting.executeVote(voteId, {from: owner})
                } catch (err) {
                    assert.equal(err.receipt.status, 0, "It should have thrown")
                    return
                }
                assert.isFalse(true, "It should have thrown")
            })
        })
    })

    context('finance access', () => {
        let financeProxyAddress, finance, vaultProxyAddress, vault, voteId = {}, script
        const payment = new web3.BigNumber(2e16)
        beforeEach(async () => {
            // generated Finance app
            financeProxyAddress = getAppProxy(receiptInstance, appIds[0])
            finance = getContract('Finance').at(financeProxyAddress)
            // generated Vault app
            vaultProxyAddress = getAppProxy(receiptInstance, appIds[2])
            vault = getContract('Vault').at(vaultProxyAddress)
            // Fund Finance
            //await logBalances(financeProxyAddress, vaultProxyAddress)
            await finance.sendTransaction({ value: payment, from: owner })
            //await logBalances(financeProxyAddress, vaultProxyAddress)
            const action = { to: financeProxyAddress, calldata: finance.contract.newPayment.getData(ETH, nonHolder, payment, 0, 0, 1, "voting payment") }
            script = encodeCallScript([action])
            const action2 = { to: voting.address, calldata: voting.contract.newVote.getData(script, 'metadata', true, true) }
            const script2 = encodeCallScript([action2])
            const r = await tokenManager.forward(script2, { from: signer1 })
            voteId = getVoteId(r)
        })

        it('finance can not be accessed directly (without a vote)', async () => {
            try {
                await finance.newPayment(ETH, nonHolder, 2e16, 0, 0, 1, "voting payment")
            } catch (err) {
                assert.equal(err.receipt.status, 0, "It should have thrown")
                return
            }
            assert.isFalse(true, "It should have thrown")
        })

        it('transfers funds if vote is approved', async () => {
            const receiverInitialBalance = await getBalance(nonHolder)
            //await logBalances(financeProxyAddress, vaultProxyAddress)
            await voting.vote(voteId, true, true, { from: signer2 })
            await voting.vote(voteId, true, true, { from: signer1 })
            //await logBalances(financeProxyAddress, vaultProxyAddress)
            assert.equal((await getBalance(nonHolder)).toString(), receiverInitialBalance.plus(payment).toString(), 'Receiver didn\'t get the payment')
        })
    })

    const logBalances = async(financeProxyAddress, vaultProxyAddress) => {
        console.log('Owner ETH: ' + await getBalance(owner))
        console.log('Finance ETH: ' + await getBalance(financeProxyAddress))
        console.log('Vault ETH: ' + await getBalance(vaultProxyAddress))
        console.log('Receiver ETH: ' + await getBalance(nonHolder))
        console.log('-----------------')
    }

    const sleep = function(s) {
        return new Promise(resolve => setTimeout(resolve, s*1000));
    }
})
