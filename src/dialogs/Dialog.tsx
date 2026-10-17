import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Dialog.module.css';

/**
 * Окно — нативный <dialog> (showModal): затемнение, фокус и Esc от браузера.
 * Порталом в body: карточки лежат в колонках с position:absolute и transform.
 */
export default function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className={s.dialog}
      aria-label={title}
      onClose={onClose}
      // клик по затемнению (вне окна) закрывает
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={s.box}>
        <button type="button" className={s.close} aria-label="Закрыть" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 className={s.title}>{title}</h2>
        <div className={s.body}>{children}</div>
      </div>
    </dialog>,
    document.body,
  );
}
