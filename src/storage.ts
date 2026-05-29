/** Serializable form state persisted to localStorage between sessions. */
export interface PersistedState {
  chainKey: string;
  contract: string;
  /** Only present when the user opts in to remembering the API key. */
  explorerApiKey?: string;
  rememberApiKey: boolean;
  events: Array<{
    signature: string;
    isGrant: boolean;
    isRevoke: boolean;
    roleArg: string | number;
    accountArg: string | number;
  }>;
  roles: Array<{ name: string; hash: string; mode: 'computed' | 'pasted' }>;
  hasRoleSignature: string;
  hasRoleRoleArg: string | number;
  hasRoleAccountArg: string | number;
  candidateAddressesText: string;
  fromBlock: string;
  toBlock: string;
}

const KEY = 'cra:v1:state';

export function loadState(): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  try {
    // Never persist the API key unless the user opted in.
    const toStore: PersistedState = { ...state };
    if (!state.rememberApiKey) delete toStore.explorerApiKey;
    localStorage.setItem(KEY, JSON.stringify(toStore));
  } catch {
    // Storage may be unavailable (private mode / quota); ignore.
  }
}
