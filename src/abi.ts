import {
  parseAbiItem,
  toFunctionSelector,
  toEventSelector,
  decodeEventLog,
  type AbiFunction,
  type AbiEvent,
  type AbiParameter,
  type Hex,
  type Address,
} from 'viem';
import type { EventDef } from './types';

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

/** Parse a human event signature into an AbiEvent + topic0, or an error message. */
export function parseEventSignature(
  signature: string,
): { abi: AbiEvent; topic0: Hex } | { error: string } {
  const sig = signature.trim();
  if (!sig) return { error: 'Signature is empty.' };
  const withPrefix = sig.startsWith('event ') ? sig : `event ${sig}`;
  try {
    const item = parseAbiItem(withPrefix);
    if (item.type !== 'event') {
      return { error: 'Not an event signature.' };
    }
    const abi = item as AbiEvent;
    return { abi, topic0: toEventSelector(abi) };
  } catch (e) {
    return { error: e instanceof Error ? e.message.split('\n')[0]! : 'Parse error.' };
  }
}

/** Build a complete EventDef from a signature + options (abi/topic0 may be undefined on parse failure). */
export function buildEventDef(
  signature: string,
  opts: Pick<EventDef, 'isGrant' | 'isRevoke' | 'roleArg' | 'accountArg'>,
): EventDef {
  const parsed = parseEventSignature(signature);
  const base: EventDef = {
    id: signature,
    signature,
    isGrant: opts.isGrant,
    isRevoke: opts.isRevoke,
    roleArg: opts.roleArg,
    accountArg: opts.accountArg,
  };
  if ('abi' in parsed) {
    base.abi = parsed.abi;
    base.topic0 = parsed.topic0;
  }
  return base;
}

/** Resolve an argument from a decoded args tuple by name or positional index. */
export function pickArg(
  inputs: readonly AbiParameter[],
  args: readonly unknown[],
  key: string | number,
): unknown {
  if (typeof key === 'number') return args[key];
  const idx = inputs.findIndex((i) => i.name === key);
  return idx >= 0 ? args[idx] : undefined;
}

export interface DecodedRoleLog {
  event: EventDef;
  role: Hex;
  account: Address;
}

/**
 * Decode an event log against the configured events. Returns the matched event
 * and extracted (role, account), or null when no event matches / decoding fails.
 * `decodeEventLog` transparently handles indexed vs non-indexed arguments, so
 * the role/account mapping works regardless of which are indexed.
 */
export function decodeLog(
  events: EventDef[],
  log: { topics: Hex[]; data: Hex },
): DecodedRoleLog | null {
  const topic0 = log.topics[0];
  if (!topic0) return null;
  const t0 = topic0.toLowerCase();
  const event = events.find((e) => e.topic0 && e.abi && e.topic0.toLowerCase() === t0);
  if (!event || !event.abi) return null;
  try {
    const decoded = decodeEventLog({
      abi: [event.abi],
      data: log.data,
      // viem wants the indexed-aware topics tuple; cast is safe for AbiEvent.
      topics: log.topics as [signature: Hex, ...args: Hex[]],
    });
    const argsRecord = (decoded.args ?? {}) as Record<string, unknown>;
    const argList = Object.values(argsRecord);
    const role =
      typeof event.roleArg === 'string'
        ? argsRecord[event.roleArg]
        : pickArg(event.abi.inputs, argList, event.roleArg);
    const account =
      typeof event.accountArg === 'string'
        ? argsRecord[event.accountArg]
        : pickArg(event.abi.inputs, argList, event.accountArg);
    if (typeof role !== 'string' || typeof account !== 'string') return null;
    return { event, role: role as Hex, account: account as Address };
  } catch {
    return null; // topic0 collision or malformed log
  }
}
