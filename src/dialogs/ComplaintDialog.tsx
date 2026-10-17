import { useState } from 'react';
import type { Card } from '../types';
import { errorText, useComplaintMutation } from '../api';
import { useFeedContext } from '../FeedContext';
import Dialog from './Dialog';
import s from './Dialog.module.css';

/** Жалоба на публикацию — в поддержку, как жалоба на комментарий. */
export default function ComplaintDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const { viewer } = useFeedContext();
  const [send, { isLoading, isSuccess }] = useComplaintMutation();
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const needEmail = !viewer.id;
  const canSend = text.trim() !== '' && (!needEmail || /\S+@\S+\.\S+/.test(email)) && !isLoading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setError('');
    try {
      await send({ id: card.id, text: text.trim(), email: needEmail ? email.trim() : undefined }).unwrap();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog title="Обращение в поддержку" onClose={onClose}>
      {isSuccess ? (
        <div className={s.sent} role="status">
          <svg className={s.check} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M7.8 12.4l2.8 2.8 5.6-6" />
          </svg>
          <p>Ваша жалоба отправлена. Мы рассмотрим её в кратчайшие сроки.</p>
          <button type="button" className={s.submit} onClick={onClose} autoFocus>
            Закрыть
          </button>
        </div>
      ) : (
        <form className={s.form} onSubmit={submit} noValidate>
          <p className={s.text}>Опишите, что вам не понравилось. Мы рассмотрим вашу жалобу в кратчайшие сроки</p>
          {needEmail && (
            <label className={s.field}>
              <span className={s.label}>Ваш email</span>
              <input
                className={s.input}
                type="email"
                autoComplete="email"
                required
                value={email}
                disabled={isLoading}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          <label className={s.field}>
            <span className={s.label}>Жалоба на «{card.title}»</span>
            <textarea
              className={`${s.input} ${s.textarea}`}
              rows={4}
              required
              autoFocus
              value={text}
              disabled={isLoading}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={s.submit} disabled={!canSend}>
            {isLoading ? 'Отправляем…' : 'Отправить'}
          </button>
        </form>
      )}
    </Dialog>
  );
}
