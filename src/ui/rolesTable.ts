import { roleHashFromName } from '../roles';
import { isBytes32 } from '../validation';
import { COMMON_ROLE_NAMES } from '../config';
import type { RoleDef } from '../types';
import { el, clear } from './dom';

interface RoleRowState {
  name: string;
  hash: string;
  mode: 'computed' | 'pasted';
}

export interface RolesController {
  getRoles(): RoleDef[];
  getState(): RoleRowState[];
}

const DATALIST_ID = 'common-role-names';

function ensureDatalist(): void {
  if (document.getElementById(DATALIST_ID)) return;
  const dl = el('datalist', { id: DATALIST_ID });
  for (const name of COMMON_ROLE_NAMES) dl.append(el('option', { value: name }));
  document.body.append(dl);
}

export function createRolesTable(
  container: HTMLElement,
  addButton: HTMLButtonElement,
  initial: RoleRowState[] | undefined,
  onChange: () => void,
): RolesController {
  ensureDatalist();
  const rows: RoleRowState[] = initial ? initial.map((r) => ({ ...r })) : [];

  function render(): void {
    clear(container);
    if (rows.length === 0) {
      container.append(
        el('p', {
          className: 'empty',
          textContent: 'No role constants defined. Add one to label results and verify membership.',
        }),
      );
    }
    rows.forEach((row, index) => {
      const nameInput = el('input', {
        type: 'text',
        value: row.name,
        placeholder: 'ROLE_NAME',
        spellcheck: false,
      });
      nameInput.setAttribute('list', DATALIST_ID);
      nameInput.oninput = () => {
        row.name = nameInput.value;
        render();
        onChange();
      };

      const modeSelect = el('select');
      for (const m of ['computed', 'pasted'] as const) {
        const opt = el('option', {
          value: m,
          textContent: m === 'computed' ? 'keccak256(name)' : 'paste bytes32',
        });
        if (m === row.mode) opt.selected = true;
        modeSelect.append(opt);
      }
      modeSelect.onchange = () => {
        row.mode = modeSelect.value as RoleRowState['mode'];
        render();
        onChange();
      };

      let hashCell: HTMLElement;
      if (row.mode === 'computed') {
        const computed = row.name.trim() ? roleHashFromName(row.name) : '';
        row.hash = computed;
        hashCell = el('div', { className: 'computed', textContent: computed || '—' });
      } else {
        const hashInput = el('input', {
          type: 'text',
          value: row.hash,
          placeholder: '0x… (32 bytes)',
          spellcheck: false,
        });
        if (row.hash && !isBytes32(row.hash)) hashInput.classList.add('invalid');
        hashInput.oninput = () => {
          row.hash = hashInput.value.trim();
          hashInput.classList.toggle('invalid', !!row.hash && !isBytes32(row.hash));
          onChange();
        };
        hashCell = hashInput;
      }

      const removeBtn = el('button', {
        type: 'button',
        className: 'icon',
        textContent: '✕',
        title: 'Remove role',
      });
      removeBtn.onclick = () => {
        rows.splice(index, 1);
        render();
        onChange();
      };

      container.append(
        el('div', { className: 'row role-row' }, [
          nameInput,
          modeSelect,
          hashCell,
          removeBtn,
        ]),
      );
    });
  }

  addButton.onclick = () => {
    rows.push({ name: '', hash: '', mode: 'computed' });
    render();
    onChange();
  };

  render();

  return {
    getRoles: () =>
      rows
        .map((r) => {
          const hash = r.mode === 'computed' && r.name.trim() ? roleHashFromName(r.name) : r.hash;
          return { name: r.name.trim(), hash: hash as RoleDef['hash'], mode: r.mode };
        })
        .filter((r) => isBytes32(r.hash)),
    getState: () => rows.map((r) => ({ ...r })),
  };
}
