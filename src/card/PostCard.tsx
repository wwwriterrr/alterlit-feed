import { useEffect, useRef, useState } from 'react';
import type { Card, Viewer } from '../types';
import { formatDate, formatFullDate, formatStamp, isFuture } from '../date';
import {
  Adult18Icon,
  ArrowNext,
  AudioIcon,
  Comment,
  CreativeMarket,
  Ellipsis,
  GoldIcon,
  Like,
  PinIcon,
  PollIcon,
  RecommendedIcon,
  Review,
} from '../icons';
import { PostAvatar, UserName } from './Author';
import RollingNumber from './RollingNumber';
import CardImage from './CardImage';
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
          {flags.is_18 && (
            <i className="post-is-18-icon" title="Для взрослых">
              <Adult18Icon />
            </i>
          )}
          {flags.is_gold && (
            <i className="post-gold-icon" title="Избранное">
              <a href="/archive/favorites/all/">
                <GoldIcon />
              </a>
            </i>
          )}
          {flags.is_pinned && (
            <i className="post-pin-icon" title="Публикация закреплена">
              <PinIcon />
            </i>
          )}
          {flags.is_recommended && (
            <i className="post-rec-icon" title="Рекомендовано редакцией">
              <a href="/archive/publications/recommended/">
                <RecommendedIcon />
              </a>
            </i>
          )}
          {flags.is_voiced && (
            <i className="post-voiced-icon" title="Озвучено">
              <a href="/archive/category/sound/">
                <AudioIcon />
              </a>
            </i>
          )}
          {poll && (
            <i className="post-poll-icon" title="Публикация содержит опрос">
              <a href="/archive/category/polls/">
                <PollIcon />
              </a>
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
        <span>
          <RollingNumber value={likes} />
        </span>
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

/** Крестик закрытия меню (залитый контур — цвет задают стили сайта, как у «…»). */
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" />
  </svg>
);

/** Какие статусы автор может править сам (post_api edit): черновик, «в профиле», на модерации. */
const AUTHOR_EDITABLE = new Set(['draft', 'profile', 'moderate']);

/** Иконки пунктов меню — простые контуры, цвет от текста. */
const MENU_ICONS = {
  share: 'M14 5l6 6-6 6M20 11H9a5 5 0 0 0-5 5v3',
  hide: 'M3 12s3.5-6 9-6c2 0 3.7.8 5 1.8M21 12s-3.5 6-9 6c-2 0-3.7-.8-5-1.8M4 4l16 16',
  show: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  remove: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  report: 'M5 21V4h11l-1.5 4L16 12H5',
} as const;

function MenuItem({
  icon,
  danger,
  href,
  disabled,
  onClick,
  children,
}: {
  icon: keyof typeof MENU_ICONS;
  danger?: boolean;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = `alp-menu-item${danger ? ' alp-menu-item--danger' : ''}`;
  const inner = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={MENU_ICONS[icon]} />
      </svg>
      <span>{children}</span>
    </>
  );
  return href ? (
    <a className={cls} href={href} role="menuitem">
      {inner}
    </a>
  ) : (
    <button type="button" className={cls} role="menuitem" disabled={disabled} onClick={onClick}>
      {inner}
    </button>
  );
}

/**
 * Меню «…» карточки — поверх размытой карточки.
 *   гость и вошедший — поделиться, пожаловаться;
 *   автор — поделиться, скрыть, редактировать (черновик, «в профиле», на модерации), удалить;
 *   is_staff на чужом посте — как вошедший, плюс отдельный блок «Администратор»:
 *   редактировать, скрыть, удалить (по правам Django). На своём посте у staff — набор автора.
 */
function MoreMenu({ card, viewer, onDone }: { card: Card; viewer: Viewer; onDone: () => void }) {
  const { section } = useFeedContext();
  const { open: openDialog } = useDialogs();
  // окно открылось — меню закрываем
  const dialogs = { open: (...a: Parameters<typeof openDialog>) => (onDone(), openDialog(...a)) };
  const [toggleHidden, { isLoading: hiding }] = useToggleHiddenMutation();
  const own = viewer.id !== null && viewer.id === card.author.id;
  const admin = viewer.is_staff && !own;
  const editable = !NO_EDIT.has(card.post_type);
  const hidden = card.status === 'hidden';
  const hide = () => toggleHidden({ id: card.id, hidden, section });
  const editHref = `/post/edit/?id=${card.id}`;
  const remove = () => dialogs.open({ kind: 'delete', card });

  return (
    <div className="post-more-wrap alp-more" role="menu" aria-label="Действия с публикацией">
      <div className="alp-menu">
        <MenuItem icon="share" onClick={() => dialogs.open({ kind: 'share', card })}>
          Поделиться
        </MenuItem>
        {own && (
          <>
            <MenuItem icon={hidden ? 'show' : 'hide'} disabled={hiding} onClick={hide}>
              {hidden ? 'Показать публикацию' : 'Скрыть публикацию'}
            </MenuItem>
            {editable && (viewer.can_change || AUTHOR_EDITABLE.has(card.status)) && (
              <MenuItem icon="edit" href={editHref}>
                Редактировать
              </MenuItem>
            )}
            {/* заказ Creative Market автор сам не удаляет — только через поддержку */}
            {(!card.flags.from_cm || viewer.can_delete) && (
              <MenuItem icon="remove" danger onClick={remove}>
                Удалить
              </MenuItem>
            )}
          </>
        )}
        {!own && (
          // гость тоже может пожаловаться — указывает email, как в старом окне поддержки
          <MenuItem icon="report" danger onClick={() => dialogs.open({ kind: 'complaint', card })}>
            Пожаловаться
          </MenuItem>
        )}
      </div>

      {admin && (viewer.can_change || viewer.can_delete) && (
        <div className="alp-menu alp-menu--admin" role="group" aria-label="Действия администратора">
          <div className="alp-menu-title">Администратор</div>
          {viewer.can_change && editable && (
            <MenuItem icon="edit" href={editHref}>
              Редактировать (админ)
            </MenuItem>
          )}
          {viewer.can_change && (
            <MenuItem icon={hidden ? 'show' : 'hide'} disabled={hiding} onClick={hide}>
              {hidden ? 'Показать (админ)' : 'Скрыть (админ)'}
            </MenuItem>
          )}
          {viewer.can_delete && (
            <MenuItem icon="remove" danger onClick={remove}>
              Удалить (админ)
            </MenuItem>
          )}
        </div>
      )}
    </div>
  );
}

/** Карточка поста — разметка parts/post_list_v2.html, чтобы работали стили сайта. */
export default function PostCard({ card }: { card: Card }) {
  const { viewer } = useFeedContext();
  const dialogs = useDialogs();
  const [toggled, setToggled] = useState(false);
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // меню «…» закрывается кликом мимо карточки и Esc
  useEffect(() => {
    if (!more) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMore(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMore(false);
    };
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close, true);
      document.removeEventListener('keydown', esc);
    };
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
    card.flags.is_poem && 'poem',
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

      {image &&
        (image.width && image.height ? (
          <CardImage
            image={image as typeof image & { width: number; height: number }}
            extraClass={t('toggle-d')}
            href={card.url}
            onOpen={() => go(card.url)}
          />
        ) : (
          // размеров ещё нет (не заполнены на сервере) — как раньше: блок фиксированной высоты
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
        ))}

      {/* плашка об упоминании наркотиков (drugs_notice: text / text_icon) — как в старом шаблоне */}
      {card.flags.drugs_notice && (
        <div className="post-drug-notice">
          <span>
            Незаконное потребление наркотических средств, психотропных веществ, их аналогов причиняет вред здоровью, их
            незаконный оборот запрещен и влечет установленную законодательством ответственность.
          </span>
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
            {/* «Голосовать» — надпись рисуют стили сайта (.pp-btn::before); окно голосования — в острове */}
            <button
              type="button"
              className={`pp-btn${card.poll.ended ? ' alp-ended' : ''}`}
              aria-label={card.poll.ended ? 'Результаты голосования' : 'Голосовать'}
              onClick={() => dialogs.open({ kind: 'vote', voteId: card.poll!.id })}
            />
          </div>
        </div>
      )}

      {card.status !== 'moderate' && (
        <>
          {card.status !== 'draft' && <Counts card={card} toggleCls={t('toggle-d-f')} />}
          <button
            type="button"
            className={`post-more-ctrl alp-ctrl${t('toggle-d-f')}`}
            aria-label={more ? 'Закрыть меню' : 'Действия с публикацией'}
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            {/* открыто меню — вместо «…» крестик */}
            {more ? <CloseIcon /> : <Ellipsis />}
          </button>
          <MoreMenu card={card} viewer={viewer} onDone={() => setMore(false)} />
        </>
      )}
    </article>
  );
}
