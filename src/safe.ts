import {
  parseAbiItem,
  decodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type AbiFunction,
} from 'viem';
import {
  SAFE_EXEC_TRANSACTION_SELECTOR,
  MULTISEND_SELECTOR,
  SAFE_EXEC_TRANSACTION_ABI,
  MULTISEND_ABI,
} from './config';

export interface InnerCall {
  to: Address;
  input: Hex;
  /** True when this call was extracted from a Safe execTransaction/multiSend wrapper. */
  viaSafe: boolean;
}

const EXEC_TX_ABI = parseAbiItem(SAFE_EXEC_TRANSACTION_ABI) as AbiFunction;
const MULTI_SEND_ABI = parseAbiItem(MULTISEND_ABI) as AbiFunction;

const MAX_DEPTH = 4;

function selectorOf(input: Hex): string {
  return input.length >= 10 ? input.slice(0, 10).toLowerCase() : '';
}

/**
 * Unpack the packed `transactions` blob of a Gnosis Safe MultiSend call.
 * Each entry: operation(1) ++ to(20) ++ value(32) ++ dataLength(32) ++ data(dataLength).
 */
function unpackMultiSend(transactions: Hex): InnerCall[] {
  const calls: InnerCall[] = [];
  const hex = transactions.slice(2); // strip 0x
  const byteLen = hex.length / 2;
  let i = 0; // byte cursor
  while (i + 85 <= byteLen) {
    // 1 + 20 + 32 + 32 = 85 bytes of header minimum
    let p = i + 1; // skip operation byte
    const to = getAddress(`0x${hex.slice(p * 2, (p + 20) * 2)}`);
    p += 20;
    p += 32; // value (ignored)
    const dataLen = Number(BigInt(`0x${hex.slice(p * 2, (p + 32) * 2)}`));
    p += 32;
    if (p + dataLen > byteLen) break; // malformed
    const data = (`0x${hex.slice(p * 2, (p + dataLen) * 2)}`) as Hex;
    p += dataLen;
    calls.push({ to, input: data, viaSafe: true });
    i = p;
  }
  return calls;
}

/**
 * Flatten a transaction into the set of effective inner calls, unwrapping
 * Gnosis Safe `execTransaction` and `multiSend` wrappers (recursively, bounded).
 * The original call is always included so direct calls are decoded normally.
 */
export function flattenCalls(to: Address | null, input: Hex, depth = 0): InnerCall[] {
  const out: InnerCall[] = [];
  if (to) out.push({ to, input, viaSafe: depth > 0 });
  if (depth >= MAX_DEPTH || input.length < 10) return out;

  const selector = selectorOf(input);

  try {
    if (selector === SAFE_EXEC_TRANSACTION_SELECTOR) {
      const { args } = decodeFunctionData({ abi: [EXEC_TX_ABI], data: input });
      const innerTo = getAddress(args![0] as Address);
      const innerData = args![2] as Hex;
      out.push(...flattenCalls(innerTo, innerData, depth + 1));
    } else if (selector === MULTISEND_SELECTOR) {
      const { args } = decodeFunctionData({ abi: [MULTI_SEND_ABI], data: input });
      const packed = args![0] as Hex;
      for (const call of unpackMultiSend(packed)) {
        out.push(...flattenCalls(call.to, call.input, depth + 1));
      }
    }
  } catch {
    // Not a (decodable) Safe wrapper — the direct call above still stands.
  }

  return out;
}

/** True when this selector is a Safe/MultiSend wrapper (used to flag provenance). */
export function isSafeWrapperSelector(input: Hex): boolean {
  const s = selectorOf(input);
  return s === SAFE_EXEC_TRANSACTION_SELECTOR || s === MULTISEND_SELECTOR;
}
