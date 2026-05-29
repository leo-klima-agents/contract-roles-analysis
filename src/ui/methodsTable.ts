import type { AbiFunction } from 'viem';
import { parseFunctionSignature, buildMethodDef } from '../abi';
import type { MethodDef } from '../types';
import { OZ_METHOD_PRESETS } from '../config';
import { el, clear } from './dom';

interface RowState {
  signature: string;
  isGrant: boolean;
  isRevoke: boolean;
  roleArg: string | number;
  accountArg: string | number;
}

/** The key used to address an argument: its name when present, else its index. */
function argKey(input: { name?: string }, index: number): string | number {
  return input.name && input.name.length > 0 ? input.name : index;
}

export interface MethodsController {
  getMethods(): MethodDef[];
  getState(): RowState[];
}

export function createMethodsTable(
  container: HTMLElement,
  addButton: HTMLButtonElement,
  initial: RowState[] | undefined,
  onChange: () => void,
): MethodsController {
  const rows: RowState[] =
    initial && initial.length
      ? initial.map((r) => ({ ...r }))
      : OZ_METHOD_PRESETS.map((p) => ({
          signature: p.signature,
          isGrant: p.isGrant,
          isRevoke: p.isRevoke,
          roleArg: p.roleArg,
          accountArg: p.accountArg,
        }));

  function argSelect(
    label: string,
    abi: AbiFunction | undefined,
    selected: string | number,
    onPick: (key: string | number) => void,
  ): HTMLElement {
    const select = el('select');
    if (!abi) {
      select.disabled = true;
      select.append(el('option', { textContent: '—' }));
    } else {
      abi.inputs.forEach((input, i) => {
        const key = argKey(input, i);
        const opt = el('option', {
          value: String(i),
          textContent: `${input.name || `arg${i}`}: ${input.type}`,
        });
        if (key === selected || String(key) === String(selected)) opt.selected = true;
        select.append(opt);
      });
      select.onchange = () => {
        const i = Number(select.value);
        const input = abi.inputs[i];
        if (input) onPick(argKey(input, i));
      };
    }
    return el('label', { className: 'arg-pick' }, [
      el('span', { textContent: label }),
      select,
    ]);
  }

  function render(): void {
    clear(container);
    rows.forEach((row, index) => {
      const parsed = parseFunctionSignature(row.signature);
      const abi = 'abi' in parsed ? parsed.abi : undefined;
      const errMsg = 'error' in parsed ? parsed.error : '';

      const sigInput = el('input', {
        type: 'text',
        value: row.signature,
        spellcheck: false,
        placeholder: 'methodName(bytes32 role, address account)',
      });
      sigInput.oninput = () => {
        row.signature = sigInput.value;
        render();
        onChange();
      };

      const errEl = el('div', { className: 'parse-err', textContent: errMsg });

      const grant = el('input', { type: 'checkbox', checked: row.isGrant });
      grant.onchange = () => {
        row.isGrant = grant.checked;
        onChange();
      };
      const revoke = el('input', { type: 'checkbox', checked: row.isRevoke });
      revoke.onchange = () => {
        row.isRevoke = revoke.checked;
        onChange();
      };

      const removeBtn = el('button', {
        type: 'button',
        className: 'icon',
        textContent: '✕',
        title: 'Remove method',
      });
      removeBtn.onclick = () => {
        rows.splice(index, 1);
        render();
        onChange();
      };

      const rowEl = el('div', { className: 'row method-row' }, [
        el('div', { className: 'sig-wrap' }, [sigInput, errEl]),
        el('label', { className: 'flag' }, [grant, document.createTextNode('Grant')]),
        el('label', { className: 'flag' }, [revoke, document.createTextNode('Revoke')]),
        argSelect('role arg', abi, row.roleArg, (k) => {
          row.roleArg = k;
          onChange();
        }),
        argSelect('account arg', abi, row.accountArg, (k) => {
          row.accountArg = k;
          onChange();
        }),
        removeBtn,
      ]);
      container.append(rowEl);
    });
  }

  addButton.onclick = () => {
    rows.push({
      signature: '',
      isGrant: true,
      isRevoke: false,
      roleArg: 'role',
      accountArg: 'account',
    });
    render();
    onChange();
  };

  render();

  return {
    getMethods: () =>
      rows.map((r) =>
        buildMethodDef(r.signature, {
          isGrant: r.isGrant,
          isRevoke: r.isRevoke,
          roleArg: r.roleArg,
          accountArg: r.accountArg,
        }),
      ),
    getState: () => rows.map((r) => ({ ...r })),
  };
}
