pragma solidity 0.4.24;

import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/apm/APMNamehash.sol";

import "@aragon/future-apps-payroll/contracts/Payroll.sol";
import "@aragon/apps-finance/contracts/Finance.sol";
import "@aragon/apps-vault/contracts/Vault.sol";

import "@aragon/kits-bare/contracts/KitBase.sol";


contract PayrollKit is KitBase, APMNamehash {
    constructor(
      DAOFactory _fac,
      ENS _ens
    )
      KitBase(_fac, _ens)
      public
    {}

    function newInstance(
        address employer,
        address root,
        uint64 financePeriodDuration,
        address denominationToken,
        IFeed priceFeed,
        uint64 rateExpiryTime
    )
      public
      returns (Kernel dao, Payroll payroll)
    {
        dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Vault vault;
        Finance finance;
        (vault, finance, payroll) = deployApps(dao);

        finance.initialize(vault, financePeriodDuration);
        payroll.initialize(finance, denominationToken, priceFeed, rateExpiryTime);

        // Payroll permissions
        acl.createPermission(employer, payroll, payroll.ADD_EMPLOYEE_ROLE(), root);
        acl.createPermission(employer, payroll, payroll.TERMINATE_EMPLOYEE_ROLE(), root);
        acl.createPermission(employer, payroll, payroll.ALLOWED_TOKENS_MANAGER_ROLE(), root);
        acl.createPermission(employer, payroll, payroll.SET_EMPLOYEE_SALARY_ROLE(), root);
        acl.createPermission(employer, payroll, payroll.ADD_ACCRUED_VALUE_ROLE(), root);
        acl.createPermission(root, payroll, payroll.CHANGE_PRICE_FEED_ROLE(), root);
        acl.createPermission(root, payroll, payroll.MODIFY_RATE_EXPIRY_ROLE(), root);

        // Finance permissions
        acl.createPermission(payroll, finance, finance.CREATE_PAYMENTS_ROLE(), root);

        // Vault permissions
        bytes32 vaultTransferRole = vault.TRANSFER_ROLE();
        acl.createPermission(finance, vault, vaultTransferRole, this); // manager is this to allow 2 grants
        acl.grantPermission(root, vault, vaultTransferRole);
        acl.setPermissionManager(root, vault, vaultTransferRole); // set root as the final manager for the role

        cleanupDAOPermissions(dao, acl, root);

        emit DeployInstance(dao);
    }

    function deployApps(Kernel dao) internal returns (Vault, Finance, Payroll) {
        bytes32 vaultAppId = apmNamehash("vault");
        bytes32 financeAppId = apmNamehash("finance");
        bytes32 payrollAppId = apmNamehash("payroll");

        Vault vault = Vault(dao.newAppInstance(vaultAppId, latestVersionAppBase(vaultAppId)));
        Finance finance = Finance(dao.newAppInstance(financeAppId, latestVersionAppBase(financeAppId)));
        Payroll payroll = Payroll(dao.newAppInstance(payrollAppId, latestVersionAppBase(payrollAppId)));

        emit InstalledApp(vault, vaultAppId);
        emit InstalledApp(finance, financeAppId);
        emit InstalledApp(payroll, payrollAppId);

        return (vault, finance, payroll);
    }
}
