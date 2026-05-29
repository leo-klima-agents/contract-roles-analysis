import type { Address, Hex, AbiFunction } from 'viem';

/** A method whose calls may grant and/or revoke a role. */
export interface MethodDef {
  /** Stable key (the signature string). */
  id: string;
  /** Human-readable signature, e.g. "grantRole(bytes32 role, address account)". */
  signature: string;
  /** Parsed ABI item (undefined while the signature fails to parse). */
  abi?: AbiFunction;
  /** 4-byte selector derived from the ABI (undefined if unparsable). */
  selector?: Hex;
  /** Treat a successful decode of this method as granting the role. */
  isGrant: boolean;
  /** Treat a successful decode of this method as revoking the role. */
  isRevoke: boolean;
  /** Argument carrying the bytes32 role (name or positional index). */
  roleArg: string | number;
  /** Argument carrying the account address (name or positional index). */
  accountArg: string | number;
}

/** A named role constant. */
export interface RoleDef {
  /** Human label, e.g. "MINTER_ROLE". */
  name: string;
  /** bytes32 value (computed from the name or pasted). */
  hash: Hex;
  /** How the hash was produced. */
  mode: 'computed' | 'pasted';
}

/** Configuration of the membership-check (view) method. */
export interface HasRoleConfig {
  /** e.g. "hasRole(bytes32 role, address account) view returns (bool)". */
  signature: string;
  roleArg: string | number;
  accountArg: string | number;
  /** Extra candidate addresses to check directly (one per line in the UI). */
  candidateAddresses: Address[];
}

export interface ScanConfig {
  fromBlock: bigint;
  toBlock: bigint;
  concurrency: number;
}

export type RoleAction = 'grant' | 'revoke';

/** A (role, account) pair discovered during the scan, with provenance. */
export interface Candidate {
  role: Hex;
  account: Address;
  /** Last observed action (chain order) for this pair within the range. */
  lastAction: RoleAction;
  txHash: Hex;
  blockNumber: bigint;
  /** True when the call was found wrapped inside a Safe execTransaction/multiSend. */
  viaSafe: boolean;
}

/** A resolved holder row for display. */
export interface Holder {
  role: Hex;
  roleName?: string;
  account: Address;
  /** True iff hasRole currently returns true. */
  hasRoleConfirmed: boolean;
  /** Provenance from the scan (absent for paste-only candidates). */
  lastAction?: RoleAction;
  txHash?: Hex;
  blockNumber?: bigint;
  viaSafe?: boolean;
}
