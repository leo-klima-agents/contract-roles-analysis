import { el, clear } from './dom';

export interface ProgressController {
  show(): void;
  set(done: number, total: number): void;
  hide(): void;
}

export function createProgress(container: HTMLElement): ProgressController {
  let bar: HTMLSpanElement | null = null;
  let label: HTMLElement | null = null;

  return {
    show() {
      clear(container);
      bar = el('span');
      label = el('div', { className: 'progress-label', textContent: 'Starting…' });
      container.append(
        el('div', { className: 'progress-wrap' }, [
          el('div', { className: 'progress-bar' }, [bar]),
          label,
        ]),
      );
    },
    set(done, total) {
      if (!bar || !label) return;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      bar.style.width = `${pct}%`;
      label.textContent = `Scanned ${done.toLocaleString()} / ${total.toLocaleString()} blocks (${pct}%)`;
    },
    hide() {
      clear(container);
      bar = null;
      label = null;
    },
  };
}
