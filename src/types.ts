import type { Address, Hex, AbiEvent } from 'viem';

/** A role-change event whose emissions may grant and/or revoke a role. */
export interface EventDef {
  /** Stable key (the signature string). */
  id: string;
  /** Human-readable signature, e.g. "RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)". */
  signature: string;
  /** Parsed ABI item (undefined while the signature fails to parse). */
  abi?: AbiEvent;
  /** 32-byte event topic0 derived from the ABI (undefined if unparsable). */
  topic0?: Hex;
  /** Treat an emission of this event as granting the role. */
  isGrant: boolean;
  /** Treat an emission of this event as revoking the role. */
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

export type RoleAction = 'grant' | 'revoke';

/** A (role, account) pair discovered during the scan, with provenance. */
export interface Candidate {
  role: Hex;
  account: Address;
  /** Last observed action (chain order) for this pair within the range. */
  lastAction: RoleAction;
  txHash: Hex;
  blockNumber: bigint;
  /**
   * True when the role change was routed through a Safe wrapper. Event-log
   * discovery cannot tell (the contract emits the event regardless of call
   * path), so this is always false here; retained for the results display.
   */
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
