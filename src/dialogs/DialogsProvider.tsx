import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Card } from '../types';
import ShareDialog from './ShareDialog';
import ComplaintDialog from './ComplaintDialog';
import DeleteDialog from './DeleteDialog';
import Dialog from './Dialog';

/** Окна ленты — одно на остров; вместо #altermodal из base.html. */
export type DialogRequest =
  | { kind: 'share'; card: Card }
  | { kind: 'complaint'; card: Card }
  | { kind: 'delete'; card: Card }
  | { kind: 'auth'; text: string };

const Ctx = createContext<{ open: (r: DialogRequest) => void }>({ open: () => {} });
export const useDialogs = () => useContext(Ctx);

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const value = useMemo(() => ({ open: setReq }), []);
  const close = () => setReq(null);

  return (
    <Ctx.Provider value={value}>
      {children}
      {req?.kind === 'share' && <ShareDialog card={req.card} onClose={close} />}
      {req?.kind === 'complaint' && <ComplaintDialog card={req.card} onClose={close} />}
      {req?.kind === 'delete' && <DeleteDialog card={req.card} onClose={close} />}
      {req?.kind === 'auth' && (
        <Dialog title="Ой!" onClose={close}>
          <p>{req.text}</p>
          <p>
            <a className="registrate-link" href="/auth/">
              Авторизоваться
            </a>{' '}
            /{' '}
            <a className="registrate-link" href="/registration/">
              Зарегистрироваться
            </a>
          </p>
        </Dialog>
      )}
    </Ctx.Provider>
  );
}
