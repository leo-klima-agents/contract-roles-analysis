import { isAddress, isHex, getAddress, type Address, type Hex } from 'viem';

/** Validate and checksum an address; returns null when invalid. */
export function normalizeAddress(value: string): Address | null {
  const v = value.trim();
  if (!isAddress(v, { strict: false })) return null;
  try {
    return getAddress(v);
  } catch {
    return null;
  }
}

/** A 32-byte hex string (0x + 64 hex chars). */
export function isBytes32(value: string): value is Hex {
  const v = value.trim();
  return isHex(v) && v.length === 66;
}

/** A well-formed http(s) RPC URL. */
export function isValidRpcUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Parse a positive bigint block number, or null. */
export function parseBlockNumber(value: string): bigint | null {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

/** Parse a newline/comma/space separated list of addresses into checksummed unique addresses. */
export function parseAddressList(value: string): { valid: Address[]; invalid: string[] } {
  const tokens = value
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: Address[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    const addr = normalizeAddress(t);
    if (!addr) {
      invalid.push(t);
      continue;
    }
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(addr);
  }
  return { valid, invalid };
}
