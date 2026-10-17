import { useState } from 'react';
import type { Card } from '../types';
import { errorText, useDeletePostMutation } from '../api';
import { useFeedContext } from '../FeedContext';
import Dialog from './Dialog';
import s from './Dialog.module.css';

export default function DeleteDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const { section } = useFeedContext();
  const [remove, { isLoading }] = useDeletePostMutation();
  const [error, setError] = useState('');

  const confirm = async () => {
    setError('');
    try {
      await remove({ id: card.id, section }).unwrap();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog title="Вы точно хотите удалить эту публикацию?" onClose={onClose}>
      {error && (
        // msg старой ручки может содержать разметку (ссылка «поддержку») — показываем текстом
        <p className={s.error} role="alert">
          {error.replace(/<[^>]+>/g, '')}
        </p>
      )}
      <div className={s.row}>
        <button type="button" className={s.danger} onClick={confirm} disabled={isLoading}>
          {isLoading ? 'Удаляем…' : 'Удалить'}
        </button>
        <button type="button" className={s.secondary} onClick={onClose} autoFocus>
          Отменить
        </button>
      </div>
    </Dialog>
  );
}
