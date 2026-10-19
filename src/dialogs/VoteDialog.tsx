import { useState } from 'react';
import type { VoteChoice } from '../types';
import { errorText, isAuthError, useCastVoteMutation, useVoteQuery } from '../api';
import { useFeedContext } from '../FeedContext';
import { formatFullDate, isFuture } from '../date';
import { NO_AVATAR } from '../card/Author';
import Dialog from './Dialog';
import s from './Vote.module.css';
import ds from './Dialog.module.css';

const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
};

/**
 * Окно голосования: варианты — кнопки. До своего голоса (и пока голосование идёт) результаты
 * скрыты, как на странице поста; после — полоски и число голосов, свой вариант отмечен.
 * Повторный клик по своему варианту снимает голос, если голосование это разрешает.
 */
export default function VoteDialog({ voteId, onClose }: { voteId: number; onClose: () => void }) {
  const { viewer } = useFeedContext();
  const { data: vote, isLoading, error: loadError } = useVoteQuery(voteId);
  const [cast, { isLoading: sending, originalArgs }] = useCastVoteMutation();
  const [error, setError] = useState('');

  const choose = async (c: VoteChoice) => {
    if (!vote || sending) return;
    setError('');
    if (!viewer.id) return setError('Чтобы проголосовать, войдите на сайт.');
    if (vote.ended) return;
    try {
      await cast({ id: vote.id, choiceId: c.id }).unwrap();
    } catch (err) {
      setError(isAuthError(err) ? 'Сессия истекла — обновите страницу и войдите снова.' : errorText(err));
    }
  };

  const max = vote ? Math.max(1, ...vote.choices.map((c) => c.votes ?? 0)) : 1;

  return (
    <Dialog title={vote?.title || 'Голосование'} onClose={onClose}>
      {isLoading && <p className={s.muted}>Загружаем голосование…</p>}
      {loadError && <p className={ds.error}>{errorText(loadError)}</p>}
      {vote && (
        <div className={s.vote}>
          {vote.description && <p className={s.descr}>{vote.description}</p>}
          {vote.multiple && !vote.ended && <p className={s.hint}>Можно выбрать несколько вариантов</p>}

          <ul className={s.choices}>
            {vote.choices.map((c) => {
              const pending = sending && originalArgs?.choiceId === c.id;
              const share = c.votes !== null ? Math.round(((c.votes ?? 0) / max) * 100) : 0;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={s.choice}
                    data-mine={c.mine || undefined}
                    data-pending={pending || undefined}
                    disabled={vote.ended || sending}
                    aria-pressed={c.mine}
                    onClick={() => choose(c)}
                  >
                    {vote.show_results && (
                      <span className={s.bar} style={{ width: `${Math.max(share, 2)}%` }} aria-hidden="true" />
                    )}
                    <span className={s.label}>
                      {c.kind === 'user' && <img className={s.avatar} src={c.avatar || NO_AVATAR} alt="" />}
                      {c.kind === 'comment' && c.image && <img className={s.thumb} src={c.image} alt="" />}
                      <span className={s.text}>
                        {c.kind === 'post' && <span className={s.kind}>Публикация</span>}
                        {c.kind === 'comment' && <span className={s.kind}>Комментарий</span>}
                        {c.text}
                      </span>
                    </span>
                    {c.mine && (
                      <svg className={s.check} viewBox="0 0 24 24" aria-label="Ваш голос">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                    {c.votes !== null && <span className={s.count}>{c.votes}</span>}
                  </button>
                  {c.url && (
                    <a className={s.link} href={c.url}>
                      {c.kind === 'user' ? 'Профиль' : 'Открыть'}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>

          {error && (
            <p className={ds.error} role="alert">
              {error}{' '}
              {!viewer.id && (
                <>
                  <a href="/auth/">Авторизоваться</a> / <a href="/registration/">Зарегистрироваться</a>
                </>
              )}
            </p>
          )}

          <p className={s.footer}>
            {vote.show_results ? (
              <>
                {vote.total} {plural(vote.total, 'голос', 'голоса', 'голосов')}
              </>
            ) : (
              'Результаты будут видны после вашего голоса'
            )}
            {vote.ended ? (
              <span className={s.ended}> · голосование окончено</span>
            ) : (
              vote.date_execute &&
              isFuture(vote.date_execute) && <span> · до {formatFullDate(vote.date_execute)}</span>
            )}
            {vote.voted && vote.can_revote && !vote.ended && <span> · нажмите на свой вариант, чтобы снять голос</span>}
          </p>
        </div>
      )}
    </Dialog>
  );
}
