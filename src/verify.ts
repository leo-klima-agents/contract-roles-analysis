import type { Address, Hex } from 'viem';
import { parseFunctionSignature } from './abi';
import type { ExplorerClient } from './explorer';
import type { Candidate, HasRoleConfig, Holder, RoleDef } from './types';

export interface VerifyInput {
  client: ExplorerClient;
  contract: Address;
  hasRole: HasRoleConfig;
  /** Pairs discovered by the scan (provenance carried through). */
  candidates: Map<string, Candidate>;
  /** Role constants used to expand candidate addresses into (role, account) pairs. */
  roles: RoleDef[];
  /** Optional name lookup for display. */
  roleNames: Map<string, string>;
}

function argPosition(inputs: readonly { name?: string }[], key: string | number): number {
  if (typeof key === 'number') return key;
  return inputs.findIndex((i) => i.name === key);
}

/**
 * Verify current membership with the configured hasRole view method via
 * multicall3 (auto-aggregated by viem). Returns one Holder per checked pair.
 *
 * Checked pairs = every scan candidate, plus every (role, account) formed by
 * crossing the configured roles with the user-supplied candidate addresses.
 */
export async function verifyHolders(input: VerifyInput): Promise<Holder[]> {
  const { client, contract, hasRole, candidates, roles, roleNames } = input;

  const parsed = parseFunctionSignature(hasRole.signature);
  if ('error' in parsed) {
    throw new Error(`Invalid hasRole signature: ${parsed.error}`);
  }
  const abi = parsed.abi;
  const rolePos = argPosition(abi.inputs, hasRole.roleArg);
  const accountPos = argPosition(abi.inputs, hasRole.accountArg);
  if (rolePos < 0 || accountPos < 0) {
    throw new Error('hasRole role/account argument mapping is invalid.');
  }

  // Collect the unique set of (role, account) pairs to check, retaining
  // scan provenance where available.
  const pairs = new Map<string, { role: Hex; account: Address; candidate?: Candidate }>();
  for (const [key, c] of candidates) {
    pairs.set(key, { role: c.role, account: c.account, candidate: c });
  }
  for (const role of roles) {
    if (!role.hash) continue;
    for (const account of hasRole.candidateAddresses) {
      const key = `${role.hash.toLowerCase()}:${account.toLowerCase()}`;
      if (!pairs.has(key)) pairs.set(key, { role: role.hash, account });
    }
  }

  const pairList = [...pairs.values()];
  if (pairList.length === 0) return [];

  const results = await client.multicall({
    allowFailure: true,
    contracts: pairList.map((p) => {
      const args = new Array<unknown>(abi.inputs.length);
      args[rolePos] = p.role;
      args[accountPos] = p.account;
      return {
        address: contract,
        abi: [abi],
        functionName: abi.name,
        args,
      } as const;
    }),
  });

  return pairList.map((p, i) => {
    const r = results[i];
    const confirmed = r?.status === 'success' ? Boolean(r.result) : false;
    const holder: Holder = {
      role: p.role,
      roleName: roleNames.get(p.role.toLowerCase()),
      account: p.account,
      hasRoleConfirmed: confirmed,
    };
    if (p.candidate) {
      holder.lastAction = p.candidate.lastAction;
      holder.txHash = p.candidate.txHash;
      holder.blockNumber = p.candidate.blockNumber;
      holder.viaSafe = p.candidate.viaSafe;
    }
    return holder;
  });
}
