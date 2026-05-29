import type { Holder } from '../types';
import { type ChainKey, txUrl, addressUrl } from '../chains';
import { el, clear, shorten } from './dom';

function link(href: string | undefined, text: string, cls: string): HTMLElement {
  if (!href) return el('span', { className: cls, textContent: text });
  return el('a', { href, target: '_blank', rel: 'noopener', className: cls, textContent: text });
}

export function renderResults(
  container: HTMLElement,
  holders: Holder[],
  chainKey: ChainKey,
): void {
  clear(container);

  if (holders.length === 0) {
    container.append(
      el('p', {
        className: 'empty',
        textContent: 'No results yet. Configure the inputs above and run the analysis.',
      }),
    );
    return;
  }

  // Group by role hash.
  const groups = new Map<string, Holder[]>();
  for (const h of holders) {
    const key = h.role.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(h);
    groups.set(key, list);
  }

  for (const [, list] of groups) {
    // Confirmed holders first, then by account.
    list.sort((a, b) => {
      if (a.hasRoleConfirmed !== b.hasRoleConfirmed) return a.hasRoleConfirmed ? -1 : 1;
      return a.account.toLowerCase() < b.account.toLowerCase() ? -1 : 1;
    });
    const sample = list[0]!;
    const confirmedCount = list.filter((h) => h.hasRoleConfirmed).length;

    const group = el('div', { className: 'role-group' });
    group.append(
      el('header', {}, [
        el('div', {}, [
          el('span', {
            className: 'role-name',
            textContent: sample.roleName ?? '(unnamed role)',
          }),
          el('div', { className: 'role-hash', textContent: sample.role }),
        ]),
        el('span', {
          className: 'role-name',
          textContent: `${confirmedCount} current holder${confirmedCount === 1 ? '' : 's'}`,
        }),
      ]),
    );

    const tbody = el('tbody');
    for (const h of list) {
      const statusCell = el('td');
      statusCell.append(
        h.hasRoleConfirmed
          ? el('span', { className: 'badge confirmed', textContent: 'hasRole ✓' })
          : el('span', { className: 'badge revoked', textContent: 'not current' }),
      );
      if (h.viaSafe) {
        statusCell.append(document.createTextNode(' '));
        statusCell.append(el('span', { className: 'badge safe', textContent: 'via Safe' }));
      }

      const accountCell = el('td', { className: 'addr' }, [
        link(addressUrl(chainKey, h.account), h.account, 'addr-link'),
      ]);

      const provenanceCell = el('td', { className: 'tx' });
      if (h.txHash) {
        provenanceCell.append(
          link(txUrl(chainKey, h.txHash), shorten(h.txHash, 10, 8), 'tx-link'),
        );
      } else {
        provenanceCell.append(el('span', { className: 'empty', textContent: 'pasted candidate' }));
      }

      const row = el('tr', {}, [
        accountCell,
        statusCell,
        el('td', { textContent: h.lastAction ?? '—' }),
        provenanceCell,
        el('td', { textContent: h.blockNumber !== undefined ? String(h.blockNumber) : '—' }),
      ]);
      if (!h.hasRoleConfirmed) row.classList.add('stale');
      tbody.append(row);
    }

    const table = el('table', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { textContent: 'Account' }),
          el('th', { textContent: 'Status' }),
          el('th', { textContent: 'Last scanned action' }),
          el('th', { textContent: 'Provenance tx' }),
          el('th', { textContent: 'Block' }),
        ]),
      ]),
      tbody,
    ]);
    group.append(table);
    container.append(group);
  }
}

/** Serialize holders to a downloadable JSON blob (bigints as strings). */
export function holdersToJson(holders: Holder[]): string {
  return JSON.stringify(
    holders,
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}
