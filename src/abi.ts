import {
  parseAbiItem,
  toFunctionSelector,
  decodeFunctionData,
  type AbiFunction,
  type Hex,
  type Address,
} from 'viem';
import type { MethodDef } from './types';

/** Parse a human signature into an AbiFunction, or return an error message. */
export function parseFunctionSignature(
  signature: string,
): { abi: AbiFunction; selector: Hex } | { error: string } {
  const sig = signature.trim();
  if (!sig) return { error: 'Signature is empty.' };
  const withPrefix = sig.startsWith('function ') ? sig : `function ${sig}`;
  try {
    const item = parseAbiItem(withPrefix);
    if (item.type !== 'function') {
      return { error: 'Not a function signature.' };
    }
    const abi = item as AbiFunction;
    return { abi, selector: toFunctionSelector(abi) };
  } catch (e) {
    return { error: e instanceof Error ? e.message.split('\n')[0]! : 'Parse error.' };
  }
}

/** Build a complete MethodDef from a signature + options (selector/abi may be undefined on parse failure). */
export function buildMethodDef(
  signature: string,
  opts: Pick<MethodDef, 'isGrant' | 'isRevoke' | 'roleArg' | 'accountArg'>,
): MethodDef {
  const parsed = parseFunctionSignature(signature);
  const base: MethodDef = {
    id: signature,
    signature,
    isGrant: opts.isGrant,
    isRevoke: opts.isRevoke,
    roleArg: opts.roleArg,
    accountArg: opts.accountArg,
  };
  if ('abi' in parsed) {
    base.abi = parsed.abi;
    base.selector = parsed.selector;
  }
  return base;
}

/** Resolve an argument from a decoded args tuple by name or positional index. */
export function pickArg(
  abi: AbiFunction,
  args: readonly unknown[],
  key: string | number,
): unknown {
  if (typeof key === 'number') return args[key];
  const idx = abi.inputs.findIndex((i) => i.name === key);
  return idx >= 0 ? args[idx] : undefined;
}

export interface DecodedRoleCall {
  method: MethodDef;
  role: Hex;
  account: Address;
}

/**
 * Decode call input against the configured methods. Returns the matched method
 * and extracted (role, account), or null when no method matches / decoding fails.
 */
export function decodeCall(methods: MethodDef[], input: Hex): DecodedRoleCall | null {
  if (input.length < 10) return null; // need at least the 4-byte selector
  const selector = input.slice(0, 10).toLowerCase() as Hex;
  const method = methods.find(
    (m) => m.selector && m.abi && m.selector.toLowerCase() === selector,
  );
  if (!method || !method.abi) return null;
  try {
    const { args } = decodeFunctionData({ abi: [method.abi], data: input });
    const argList = (args ?? []) as readonly unknown[];
    const role = pickArg(method.abi, argList, method.roleArg);
    const account = pickArg(method.abi, argList, method.accountArg);
    if (typeof role !== 'string' || typeof account !== 'string') return null;
    return { method, role: role as Hex, account: account as Address };
  } catch {
    return null; // selector collision or malformed input
  }
}
