import type { Hex } from 'viem';

/** Multicall3 — same address on every chain we support. */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/** Default block window used by the "last N blocks" helper. */
export const DEFAULT_BLOCK_WINDOW = 2000n;

/** OpenZeppelin AccessControl event presets (signature + grant/revoke semantics). */
export interface EventPreset {
  signature: string;
  isGrant: boolean;
  isRevoke: boolean;
  roleArg: string | number;
  accountArg: string | number;
}

export const OZ_EVENT_PRESETS: EventPreset[] = [
  {
    signature: 'RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
    isGrant: true,
    isRevoke: false,
    roleArg: 'role',
    accountArg: 'account',
  },
  {
    signature: 'RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
    isGrant: false,
    isRevoke: true,
    roleArg: 'role',
    accountArg: 'account',
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

/** Etherscan V2 unified API endpoint (chain selected via the `chainid` param). */
export const EXPLORER_V2_BASE = 'https://api.etherscan.io/v2/api';
