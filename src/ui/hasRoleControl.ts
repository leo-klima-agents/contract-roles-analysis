import type { AbiFunction } from 'viem';
import { parseFunctionSignature } from '../abi';
import { parseAddressList } from '../validation';
import { DEFAULT_HASROLE_SIGNATURE } from '../config';
import type { HasRoleConfig } from '../types';
import { el, clear } from './dom';

interface HasRoleState {
  signature: string;
  roleArg: string | number;
  accountArg: string | number;
  candidateAddressesText: string;
}

function argKey(input: { name?: string }, index: number): string | number {
  return input.name && input.name.length > 0 ? input.name : index;
}

export interface HasRoleController {
  getConfig(): HasRoleConfig;
  getState(): HasRoleState;
}

export function createHasRoleControl(
  container: HTMLElement,
  initial: Partial<HasRoleState> | undefined,
  onChange: () => void,
): HasRoleController {
  const state: HasRoleState = {
    signature: initial?.signature ?? DEFAULT_HASROLE_SIGNATURE,
    roleArg: initial?.roleArg ?? 'role',
    accountArg: initial?.accountArg ?? 'account',
    candidateAddressesText: initial?.candidateAddressesText ?? '',
  };

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
        if (String(key) === String(selected)) opt.selected = true;
        select.append(opt);
      });
      select.onchange = () => {
        const input = abi.inputs[Number(select.value)];
        if (input) onPick(argKey(input, Number(select.value)));
      };
    }
    return el('label', { className: 'arg-pick' }, [el('span', { textContent: label }), select]);
  }

  function render(): void {
    clear(container);
    const parsed = parseFunctionSignature(state.signature);
    const abi = 'abi' in parsed ? parsed.abi : undefined;
    const errMsg = 'error' in parsed ? parsed.error : '';

    const sigInput = el('input', {
      type: 'text',
      value: state.signature,
      spellcheck: false,
    });
    sigInput.oninput = () => {
      state.signature = sigInput.value;
      render();
      onChange();
    };

    const candidates = el('textarea', {
      value: state.candidateAddressesText,
      placeholder: '0xabc…\n0xdef… (one address per line)',
      spellcheck: false,
    });
    candidates.oninput = () => {
      state.candidateAddressesText = candidates.value;
      updateCandidateHint();
      onChange();
    };

    const candidateHint = el('small', { className: 'hint' });
    function updateCandidateHint(): void {
      const { valid, invalid } = parseAddressList(state.candidateAddressesText);
      if (invalid.length) {
        candidateHint.className = 'hint err';
        candidateHint.textContent = `${valid.length} valid · ${invalid.length} invalid (${invalid
          .slice(0, 2)
          .join(', ')}${invalid.length > 2 ? '…' : ''})`;
      } else {
        candidateHint.className = 'hint ok';
        candidateHint.textContent = valid.length ? `${valid.length} address(es)` : '';
      }
    }
    updateCandidateHint();

    container.append(
      el('div', { className: 'grid' }, [
        el('label', { className: 'field span-2' }, [
          el('span', { textContent: 'hasRole signature' }),
          sigInput,
          el('small', { className: errMsg ? 'hint err' : 'hint', textContent: errMsg }),
        ]),
        argSelect('role arg', abi, state.roleArg, (k) => {
          state.roleArg = k;
          onChange();
        }),
        argSelect('account arg', abi, state.accountArg, (k) => {
          state.accountArg = k;
          onChange();
        }),
        el('label', { className: 'field span-2' }, [
          el('span', { textContent: 'Extra candidate addresses (optional)' }),
          candidates,
          candidateHint,
        ]),
      ]),
    );
  }

  render();

  return {
    getConfig: () => ({
      signature: state.signature,
      roleArg: state.roleArg,
      accountArg: state.accountArg,
      candidateAddresses: parseAddressList(state.candidateAddressesText).valid,
    }),
    getState: () => ({ ...state }),
  };
}
