import {
  CHAIN_ORDER,
  CHAIN_LABELS,
  isChainKey,
  type ChainKey,
} from './chains';
import { makeExplorerClient, scanViaExplorer, type ExplorerClient } from './explorer';
import {
  normalizeAddress,
  isValidApiKey,
  parseBlockNumber,
} from './validation';
import { DEFAULT_BLOCK_WINDOW, DEFAULT_HASROLE_SIGNATURE } from './config';
import { buildRoleNameMap } from './roles';
import { verifyHolders } from './verify';
import { loadState, saveState, type PersistedState } from './storage';
import type { Holder } from './types';
import { $, el } from './ui/dom';
import { createEventsTable } from './ui/eventsTable';
import { createRolesTable } from './ui/rolesTable';
import { createHasRoleControl } from './ui/hasRoleControl';
import { createProgress } from './ui/progress';
import { renderResults, holdersToJson } from './ui/resultsTable';

// ---- Element references ----
const chainSelect = $<HTMLSelectElement>('chain');
const apiKeyInput = $<HTMLInputElement>('explorerApiKey');
const apiKeyHint = $('apiKeyHint');
const contractInput = $<HTMLInputElement>('contract');
const contractHint = $('contractHint');
const rememberApiKey = $<HTMLInputElement>('rememberApiKey');
const fromBlockInput = $<HTMLInputElement>('fromBlock');
const toBlockInput = $<HTMLInputElement>('toBlock');
const useLatestBtn = $<HTMLButtonElement>('useLatest');
const scanEstimate = $('scanEstimate');
const runScanBtn = $<HTMLButtonElement>('runScan');
const cancelScanBtn = $<HTMLButtonElement>('cancelScan');
const statusEl = $('status');
const exportBtn = $<HTMLButtonElement>('exportJson');
const resultsEl = $('results');

const progress = createProgress($('progress'));

// ---- Restore persisted state ----
const saved = loadState();

for (const key of CHAIN_ORDER) {
  const opt = el('option', { value: key, textContent: CHAIN_LABELS[key] });
  chainSelect.append(opt);
}
chainSelect.value = saved?.chainKey && isChainKey(saved.chainKey) ? saved.chainKey : 'base';

contractInput.value = saved?.contract ?? '';
rememberApiKey.checked = saved?.rememberApiKey ?? false;
// Prefer a remembered API key; otherwise prefill from the dev-only injected value.
apiKeyInput.value = saved?.explorerApiKey ?? (__DEV_API_KEY__ || '');
fromBlockInput.value = saved?.fromBlock ?? '';
toBlockInput.value = saved?.toBlock ?? '';

// ---- Controllers ----
const events = createEventsTable(
  $('eventsTable'),
  $<HTMLButtonElement>('addEvent'),
  saved?.events,
  persist,
);
const roles = createRolesTable(
  $('rolesTable'),
  $<HTMLButtonElement>('addRole'),
  saved?.roles,
  persist,
);
const hasRole = createHasRoleControl(
  $('hasRoleControl'),
  saved
    ? {
        signature: saved.hasRoleSignature ?? DEFAULT_HASROLE_SIGNATURE,
        roleArg: saved.hasRoleRoleArg ?? 'role',
        accountArg: saved.hasRoleAccountArg ?? 'account',
        candidateAddressesText: saved.candidateAddressesText ?? '',
      }
    : undefined,
  persist,
);

// ---- Persistence ----
function collectState(): PersistedState {
  const hr = hasRole.getState();
  return {
    chainKey: chainSelect.value,
    contract: contractInput.value.trim(),
    explorerApiKey: apiKeyInput.value.trim(),
    rememberApiKey: rememberApiKey.checked,
    events: events.getState(),
    roles: roles.getState(),
    hasRoleSignature: hr.signature,
    hasRoleRoleArg: hr.roleArg,
    hasRoleAccountArg: hr.accountArg,
    candidateAddressesText: hr.candidateAddressesText,
    fromBlock: fromBlockInput.value.trim(),
    toBlock: toBlockInput.value.trim(),
  };
}

function persist(): void {
  saveState(collectState());
}

// ---- Validation hints ----
function validateApiKey(): boolean {
  const v = apiKeyInput.value.trim();
  if (!v) {
    apiKeyHint.textContent = '';
    apiKeyInput.classList.remove('invalid');
    return false;
  }
  const ok = isValidApiKey(v);
  apiKeyInput.classList.toggle('invalid', !ok);
  apiKeyHint.className = ok ? 'hint ok' : 'hint err';
  apiKeyHint.textContent = ok ? '' : 'Expected an alphanumeric Etherscan V2 API key.';
  return ok;
}

function validateContract(): boolean {
  const addr = normalizeAddress(contractInput.value);
  const ok = addr !== null;
  contractInput.classList.toggle('invalid', !ok && contractInput.value.trim() !== '');
  contractHint.className = ok ? 'hint ok' : 'hint err';
  contractHint.textContent =
    contractInput.value.trim() === '' ? '' : ok ? `Checksummed: ${addr}` : 'Invalid address.';
  return ok;
}

function updateEstimate(): void {
  const from = parseBlockNumber(fromBlockInput.value);
  const toRaw = toBlockInput.value.trim();
  if (from === null) {
    scanEstimate.textContent = '';
    return;
  }
  if (toRaw === '') {
    scanEstimate.textContent =
      'Explorer API: a few paginated getLogs request(s) from this block to latest — fast, and captures role changes via any call path.';
    return;
  }
  const to = parseBlockNumber(toRaw);
  if (to === null) {
    scanEstimate.textContent = '';
    return;
  }
  if (to < from) {
    scanEstimate.textContent = '"To block" must be ≥ "from block".';
    return;
  }
  const count = to - from + 1n;
  scanEstimate.textContent = `Explorer API: a few paginated getLogs request(s) over ${count.toLocaleString()} block(s) — fast, and captures role changes via any call path.`;
}

apiKeyInput.addEventListener('input', () => {
  validateApiKey();
  persist();
});
contractInput.addEventListener('input', () => {
  validateContract();
  persist();
});
chainSelect.addEventListener('change', persist);
rememberApiKey.addEventListener('change', persist);
for (const inp of [fromBlockInput, toBlockInput]) {
  inp.addEventListener('input', () => {
    updateEstimate();
    persist();
  });
}

validateApiKey();
validateContract();
updateEstimate();

// ---- Build a client from current inputs (or report why we can't) ----
function buildClient(): { client: ExplorerClient; chainKey: ChainKey } | null {
  if (!validateApiKey()) {
    setStatus('Enter a valid Etherscan V2 API key.', 'err');
    return null;
  }
  if (!isChainKey(chainSelect.value)) {
    setStatus('Select a chain.', 'err');
    return null;
  }
  const chainKey = chainSelect.value;
  return { client: makeExplorerClient(chainKey, apiKeyInput.value.trim()), chainKey };
}

function setStatus(text: string, kind: '' | 'ok' | 'err' = ''): void {
  statusEl.textContent = text;
  statusEl.className = kind ? `status ${kind}` : 'status';
}

// ---- "Last N blocks → latest" helper ----
useLatestBtn.addEventListener('click', async () => {
  const built = buildClient();
  if (!built) return;
  useLatestBtn.disabled = true;
  setStatus('Fetching latest block…');
  try {
    const latest = await built.client.getBlockNumber();
    const from = latest > DEFAULT_BLOCK_WINDOW ? latest - DEFAULT_BLOCK_WINDOW : 0n;
    fromBlockInput.value = String(from);
    toBlockInput.value = String(latest);
    updateEstimate();
    persist();
    setStatus(`Latest block is ${latest.toLocaleString()}.`, 'ok');
  } catch (e) {
    setStatus(`Failed to fetch latest block: ${errMsg(e)}`, 'err');
  } finally {
    useLatestBtn.disabled = false;
  }
});

// ---- Run analysis ----
let abort: AbortController | null = null;
let lastHolders: Holder[] = [];

runScanBtn.addEventListener('click', async () => {
  if (!validateContract()) {
    setStatus('Enter a valid contract address.', 'err');
    return;
  }
  const built = buildClient();
  if (!built) return;
  const contract = normalizeAddress(contractInput.value)!;

  const from = parseBlockNumber(fromBlockInput.value);
  if (from === null) {
    setStatus('Enter a valid "from block".', 'err');
    return;
  }
  const toRaw = toBlockInput.value.trim();
  const toParsed = toRaw === '' ? null : parseBlockNumber(toRaw);
  if (toRaw !== '' && toParsed === null) {
    setStatus('Enter a valid "to block" (or leave it blank for latest).', 'err');
    return;
  }

  const eventDefs = events.getEvents().filter((e) => e.topic0 && (e.isGrant || e.isRevoke));
  if (eventDefs.length === 0) {
    setStatus('Define at least one valid grant/revoke event.', 'err');
    return;
  }

  abort = new AbortController();
  runScanBtn.disabled = true;
  cancelScanBtn.disabled = false;
  exportBtn.disabled = true;
  progress.show('requests');

  try {
    // Resolve "latest" for a blank "to block".
    let to = toParsed;
    if (to === null) {
      setStatus('Resolving latest block…');
      to = await built.client.getBlockNumber();
    }
    if (to < from) {
      setStatus('Block range is invalid (from ≤ to).', 'err');
      return;
    }

    setStatus('Discovering role events via the explorer API…');
    const scan = await scanViaExplorer(
      contract,
      eventDefs,
      { apiKey: apiKeyInput.value.trim(), chainKey: built.chainKey, fromBlock: from, toBlock: to },
      (done, total) => progress.set(done, total),
      abort.signal,
    );

    setStatus(
      `Found ${scan.candidates.size} candidate pair(s) from ${scan.matchedActions} matched event(s). Verifying with hasRole…`,
    );

    const roleDefs = roles.getRoles();
    const holders = await verifyHolders({
      client: built.client,
      contract,
      hasRole: hasRole.getConfig(),
      candidates: scan.candidates,
      roles: roleDefs,
      roleNames: buildRoleNameMap(roleDefs),
    });

    lastHolders = holders;
    renderResults(resultsEl, holders, built.chainKey);
    exportBtn.disabled = holders.length === 0;

    const confirmed = holders.filter((h) => h.hasRoleConfirmed).length;
    setStatus(
      `Done. ${confirmed} current holder(s) confirmed across ${roleDefs.length || '—'} role(s); ${holders.length} pair(s) checked.`,
      'ok',
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      setStatus('Scan cancelled.', '');
    } else {
      setStatus(`Error: ${errMsg(e)}`, 'err');
    }
  } finally {
    progress.hide();
    runScanBtn.disabled = false;
    cancelScanBtn.disabled = true;
    abort = null;
  }
});

cancelScanBtn.addEventListener('click', () => {
  abort?.abort();
  cancelScanBtn.disabled = true;
});

// ---- Export ----
exportBtn.addEventListener('click', () => {
  if (lastHolders.length === 0) return;
  const blob = new Blob([holdersToJson(lastHolders)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'contract-roles.json' });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message.split('\n')[0]!;
  return String(e);
}

renderResults(resultsEl, [], 'base');
