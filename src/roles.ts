import { keccak256, stringToHex, type Hex } from 'viem';
import { DEFAULT_ADMIN_ROLE } from './config';
import type { RoleDef } from './types';

/**
 * Compute the bytes32 value of a named OpenZeppelin role.
 * DEFAULT_ADMIN_ROLE is the zero hash; every other role is
 * keccak256(utf8 bytes of the name).
 */
export function roleHashFromName(name: string): Hex {
  const n = name.trim();
  if (n === 'DEFAULT_ADMIN_ROLE') return DEFAULT_ADMIN_ROLE;
  return keccak256(stringToHex(n));
}

/** Build a name -> label lookup keyed by lowercased bytes32 hash. */
export function buildRoleNameMap(roles: RoleDef[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of roles) {
    if (!r.hash) continue;
    map.set(r.hash.toLowerCase(), r.name.trim() || r.hash);
  }
  return map;
}
