import { useEffect, useRef, useState } from 'react';
import type { Card, Viewer } from '../types';
import { formatDate, formatFullDate, formatStamp, isFuture } from '../date';
import { ArrowNext, Comment, CreativeMarket, Ellipsis, Like, Review } from '../icons';
import { PostAvatar, UserName } from './Author';
import { useDialogs } from '../dialogs/DialogsProvider';
import { useFeedContext } from '../FeedContext';
import { isAuthError, useLikeMutation, useToggleHiddenMutation } from '../api';

/** У каких типов нет рецензий (кнопки рецензий нет и в старом шаблоне). */
const NO_REVIEWS = new Set(['review', 'special', 'story', 'creative']);
/** Какие нельзя править из ленты. */
const NO_EDIT = new Set(['story', 'creative']);

const go = (url: string) => {
  window.location.href = url;
};

function Head({ card, onToggle }: { card: Card; onToggle?: () => void }) {
  const { flags, poll } = card;
  const icons = flags.is_gold || flags.is_pinned || flags.is_recommended || flags.is_voiced || poll || flags.from_cm || flags.is_18;
  return (
    <div className="post-head">
      {onToggle && (
        <button className="post-toggle-btn" type="button" onClick={onToggle} aria-label="Свернуть или развернуть">
          <ArrowNext />
        </button>
      )}
      {card.post_type === 'review' && card.review_of ? (
        <h2>
          <a className="rev-link" href="/archive/reviews/all/">
            Рецензия:
          </a>{' '}
          <a className="post-link" href={card.review_of.url}>
            "{card.review_of.title.length > 60 ? card.review_of.title.slice(0, 59) + '…' : card.review_of.title}"
          </a>
        </h2>
      ) : card.post_type === 'creative' ? (
        <h2>
          <a className="rev-link" href="/archive/creativemarket/all/">
            Creative Market
          </a>
        </h2>
      ) : card.categories.length ? (
        <ul className="post-category">
          {card.categories.map((c) => (
            <li key={c.slug}>
              <a href={c.url}>{c.title}</a>
            </li>
          ))}
        </ul>
      ) : (
        <h2>Публикация</h2>
      )}
      {icons && (
        <div className="post-head-icons">
          {/* TODO иконки: svg_is_gold, svg_pin, svg_recommended, svg_audio, svg_poll, svg_18+ — ждём разметку */}
          {flags.is_18 && <i className="post-is-18-icon" title="Для взрослых" />}
          {flags.is_gold && (
            <i className="post-gold-icon" title="Избранное">
              <a href="/archive/favorites/all/" aria-label="Избранное" />
            </i>
          )}
          {flags.is_pinned && <i className="post-pin-icon" />}
          {flags.is_recommended && (
            <i className="post-rec-icon" title="Рекомендовано редакцией">
              <a href="/archive/publications/recommended/" aria-label="Рекомендовано редакцией" />
            </i>
          )}
          {flags.is_voiced && (
            <i className="post-voiced-icon" title="Озвучено">
              <a href="/archive/category/sound/" aria-label="Озвучено" />
            </i>
          )}
          {poll && (
            <i className="post-poll-icon" title="Публикация содержит опрос">
              <a href="/archive/category/polls/" aria-label="Опрос" />
            </i>
          )}
          {flags.from_cm && (
            <i className="post-from-cm-icon" title="Заказ CREATIVE MARKET">
              <a href="/archive/creativemarket/all/">
                <CreativeMarket />
              </a>
            </i>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Сердце лайка, как в комментариях: «пульс», только когда лайк поставили (не при загрузке
 * уже лайкнутых), цвет — плавно. Новый key — анимация проигрывается заново при каждом лайке.
 */
function LikeHeart({ liked }: { liked: boolean }) {
  const [pulse, setPulse] = useState(0);
  const [prevLiked, setPrevLiked] = useState(liked);
  if (liked !== prevLiked) {
    setPrevLiked(liked);
    if (liked) setPulse(pulse + 1);
  }
  return <Like key={pulse} className={`alp-heart${pulse ? ' alp-heart-pulse' : ''}`} />;
}

function Counts({ card, toggleCls }: { card: Card; toggleCls: string }) {
  const { section, viewer } = useFeedContext();
  const dialogs = useDialogs();
  const [like, { isLoading }] = useLikeMutation();
  const { likes, comments, reviews, liked } = card.counts;

  const needAuth = () => dialogs.open({ kind: 'auth', text: 'Вы должны быть авторизованы, чтобы ставить лайки' });
  const onLike = () => {
    if (!viewer.id) return needAuth();
    // пока идёт запрос, повторный клик не отправляем (ручка — переключатель)
    if (isLoading) return;
    // сессия могла истечь, пока страница открыта: сервер не принял — то же окно
    like({ id: card.id, section })
      .unwrap()
      .catch((err) => isAuthError(err) && needAuth());
  };

  return (
    <ul className={`post-counts${toggleCls}`}>
      <li
        // без класса load: сайт на время запроса делает кнопку бледной — здесь отклик мгновенный
        className={`likes${liked ? ' liked' : ''}`}
        data-url={`/likes/post/${card.id}/`}
        title="Количество лайков"
        onClick={onLike}
      >
        <LikeHeart liked={liked} />
        <span>{likes || ''}</span>
      </li>
      <li
        className={`comments${comments ? ' commented' : ''}`}
        data-url={`${card.url}?anchor=comments`}
        title="Количество комментариев к публикации"
        onClick={() => go(`${card.url}?anchor=comments`)}
      >
        <Comment />
        <span>{comments || ''}</span>
      </li>
      {!NO_REVIEWS.has(card.post_type) && (
        <li
          className={`reviews${reviews ? ' reviewed' : ''}`}
          data-url={`/archive/reviews/${card.id}/`}
          title="Количество рецензий на публикацию"
          onClick={() => go(`/archive/reviews/${card.id}/`)}
        >
          <Review />
          <span>{reviews || ''}</span>
        </li>
      )}
    </ul>
  );
}

/** «Сохранить в избранное» — на сайте пока только анимация, без запроса; повторяем как есть. */
function FavButton() {
  const [state, setState] = useState<'' | 'load' | 'success' | 'remove'>('');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const click = () => {
    setState('load');
    timers.current.push(
      window.setTimeout(() => {
        setState('success');
        timers.current.push(window.setTimeout(() => setState('remove'), 1000));
      }, 1000),
    );
  };
  return <button type="button" className={`post-mbtn post-add-fav${state ? ' ' + state : ''}`} onClick={click} />;
}

function MoreMenu({ card, viewer, onDone }: { card: Card; viewer: Viewer; onDone: () => void }) {
  const { section } = useFeedContext();
  const { open: openDialog } = useDialogs();
  // окно открылось — меню закрываем
  const dialogs = { open: (...a: Parameters<typeof openDialog>) => (onDone(), openDialog(...a)) };
  const [toggleHidden, { isLoading: hiding }] = useToggleHiddenMutation();
  const own = viewer.id === card.author.id;
  return (
    <div className="post-more-wrap">
      <button type="button" className="post-mbtn post-share" onClick={() => dialogs.open({ kind: 'share', card })}>
        Поделиться
      </button>
      {viewer.id && <FavButton />}
      {viewer.can_change && !NO_EDIT.has(card.post_type) && (
        <a className="post-mbtn" href={`/post/edit/?id=${card.id}`}>
          Редактировать{!own && ' (админ)'}
        </a>
      )}
      <button
        type="button"
        className="post-mbtn post-compl red"
        data-post_id={card.id}
        // гость тоже может пожаловаться — указывает email, как в старом окне поддержки
        onClick={() => dialogs.open({ kind: 'complaint', card })}
      >
        Пожаловаться
      </button>
      {(own || viewer.can_delete) && (
        <button type="button" className="post-mbtn post-remove red" onClick={() => dialogs.open({ kind: 'delete', card })}>
          Удалить{!own && ' (админ)'}
        </button>
      )}
      {viewer.can_hide && (
        <button
          type="button"
          className={`post-mbtn post-hide${hiding ? ' load' : ''}`}
          data-postid={card.id}
          data-status={card.status}
          disabled={hiding}
          onClick={() => toggleHidden({ id: card.id, hidden: card.status === 'hidden', section })}
        />
      )}
    </div>
  );
}

/** Карточка поста — разметка parts/post_list_v2.html, чтобы работали стили сайта. */
export default function PostCard({ card }: { card: Card }) {
  const { viewer } = useFeedContext();
  const [toggled, setToggled] = useState(false);
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // меню «…» закрывается кликом мимо карточки
  useEffect(() => {
    if (!more) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMore(false);
    };
    document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [more]);

  const toggle = !!card.toggle;
  const t = (cls: string) => (toggle ? ` ${cls}` : '');
  const delayed = isFuture(card.date);
  const image = card.mem ?? card.cover;
  const cls = [
    'post',
    toggle && 'toggle',
    toggle && toggled && 'toggled',
    card.status === 'moderate' && 'moderate',
    delayed && 'delay',
    more && 'more',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article ref={ref} className={cls} id={`post-${card.id}`} data-status={card.status} data-href={card.poll?.url}>
      <Head card={card} onToggle={toggle ? () => setToggled((v) => !v) : undefined} />

      {delayed && (
        <div className="post-delay">
          <span>Публикация отложена до {formatStamp(card.date)}</span>
        </div>
      )}

      <div className="post-status" />

      <div className={`post-user${t('toggle-d-f')}`}>
        <a href={card.author.url}>
          <PostAvatar postId={card.id} author={card.author} storyCategory={card.story_category} />
        </a>
        <div className="pu-name">
          <span className="username">
            <UserName author={card.author} />
          </span>
          <span className="datetime" title={formatFullDate(card.date)}>
            {formatDate(card.date)}
          </span>
        </div>
      </div>

      {image && (
        <div className={`post-image${t('toggle-d')} ${image.orientation}`} data-href={card.url} onClick={() => go(card.url)}>
          <img
            id={`image-${image.id}`}
            data-fullsrc={image.full ?? image.src}
            data-src={image.src}
            src={image.src}
            loading="lazy"
            alt=""
          />
        </div>
      )}

      <h3 className={`post-title${t('toggle-d')}`}>
        <a href={card.url}>{card.title}</a>
      </h3>
      <div className={`post-excerpt${t('toggle-d')}`}>
        <a href={card.url}>{card.excerpt}</a>
      </div>

      {card.poll && (
        <div className="post-poll">
          <div className="pp-title">{card.poll.title}</div>
          <div className="pp-descr">{card.poll.description}</div>
          <div className="pp-btn-wrap">
            {/* голосование — на странице опроса (окно с голосованием перенесём вместе с блоком «Голосование») */}
            <button type="button" className="pp-btn" onClick={() => go(card.poll!.url)} />
          </div>
        </div>
      )}

      {card.status !== 'moderate' && (
        <>
          {card.status !== 'draft' && <Counts card={card} toggleCls={t('toggle-d-f')} />}
          <button
            type="button"
            className={`post-more-ctrl${t('toggle-d-f')}`}
            aria-label="Ещё"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            <Ellipsis />
          </button>
          <MoreMenu card={card} viewer={viewer} onDone={() => setMore(false)} />
        </>
      )}
    </article>
  );
}
