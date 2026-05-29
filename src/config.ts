import type { Hex } from 'viem';

/** Multicall3 — same address on every chain we support. */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/** Default block window used by the "last N blocks" helper. */
export const DEFAULT_BLOCK_WINDOW = 2000n;

/** OpenZeppelin AccessControl method presets (signature + grant/revoke semantics). */
export interface MethodPreset {
  signature: string;
  isGrant: boolean;
  isRevoke: boolean;
  roleArg: string | number;
  accountArg: string | number;
}

export const OZ_METHOD_PRESETS: MethodPreset[] = [
  {
    signature: 'grantRole(bytes32 role, address account)',
    isGrant: true,
    isRevoke: false,
    roleArg: 'role',
    accountArg: 'account',
  },
  {
    signature: 'revokeRole(bytes32 role, address account)',
    isGrant: false,
    isRevoke: true,
    roleArg: 'role',
    accountArg: 'account',
  },
  {
    // In OZ the holder renounces a role for itself; the second arg is the account.
    signature: 'renounceRole(bytes32 role, address callerConfirmation)',
    isGrant: false,
    isRevoke: true,
    roleArg: 'role',
    accountArg: 'callerConfirmation',
  },
];

export const DEFAULT_HASROLE_SIGNATURE =
  'hasRole(bytes32 role, address account) view returns (bool)';

export const DEFAULT_ADMIN_ROLE: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Common OZ role-name presets offered in the roles editor. */
export const COMMON_ROLE_NAMES = [
  'DEFAULT_ADMIN_ROLE',
  'MINTER_ROLE',
  'BURNER_ROLE',
  'PAUSER_ROLE',
  'UPGRADER_ROLE',
  'OPERATOR_ROLE',
];

/** Gnosis Safe call selectors we unwrap during the scan. */
export const SAFE_EXEC_TRANSACTION_SELECTOR = '0x6a761202' as const;
export const MULTISEND_SELECTOR = '0x8d80ff0a' as const;

export const SAFE_EXEC_TRANSACTION_ABI =
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)';

export const MULTISEND_ABI =
  'function multiSend(bytes transactions)';
