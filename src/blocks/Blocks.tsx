import { useEffect, useRef, useState } from 'react';
import type { AnnouncementsBlock, Block, EarsBlock, Widget1Block } from '../types';
import { formatDate, formatFullDate } from '../date';
import { ArrowNext, Exclam } from '../icons';
import { NO_AVATAR, displayName } from '../card/Author';
import PostCard from '../card/PostCard';
import Iod from './Iod';

/**
 * Сворачиваемый блок (article.post.toggle): стрелка в шапке, класс toggled.
 * Свёрнут блок только на телефоне (≤500px, стили сайта); там вместо серой шапки — своё
 * свёрнутое состояние по смыслу блока (.alp-peek), тап по нему — развернуть.
 */
function useToggle() {
  const [toggled, setToggled] = useState(false);
  return {
    toggled,
    open: () => setToggled(true),
    cls: toggled ? ' toggled' : '',
    button: (
      <button className="post-toggle-btn" type="button" onClick={() => setToggled((v) => !v)} aria-label="Свернуть или развернуть">
        <ArrowNext />
      </button>
    ),
  };
}

/** Объявления — новости: в свёрнутом виде видна свежая, заголовки сменяют друг друга. */
function AnnouncementsPeek({ block, onOpen }: { block: AnnouncementsBlock; onOpen: () => void }) {
  const items = block.items;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % items.length), 4500);
    return () => clearInterval(t);
  }, [items.length]);
  const item = items[i];
  return (
    <button type="button" className="alp-peek alp-peek--news" onClick={onOpen} aria-label={`Объявления: ${items.length}. Развернуть`}>
      <span className="alp-peek-badge" aria-hidden="true">
        <Exclam />
      </span>
      <span className="alp-peek-body">
        <span className="alp-peek-label">
          Объявления <span className="alp-peek-count">{items.length}</span>
        </span>
        {/* новый key — заголовок въезжает заново */}
        <span key={i} className="alp-peek-line">
          <span className="alp-peek-date">{formatDate(item.date)}</span> {item.title}
        </span>
      </span>
      <PeekChevron />
    </button>
  );
}

/** Конкурс — поток работ участников: аватары последних авторов и сколько работ. */
function Widget1Peek({ block, onOpen }: { block: Widget1Block; onOpen: () => void }) {
  const n = block.posts.length;
  return (
    <button type="button" className="alp-peek alp-peek--crowd" onClick={onOpen} aria-label={`${block.title}: ${n} новых работ. Развернуть`}>
      <span className="alp-peek-body">
        <span className="alp-peek-title">{block.title}</span>
        <span className="alp-peek-crowd">
          <span className="alp-peek-avatars" aria-hidden="true">
            {block.posts.map((p, k) => (
              <img key={k} src={p.author.avatar || NO_AVATAR} alt="" style={{ zIndex: n - k }} />
            ))}
          </span>
          <span className="alp-peek-meta">
            {n} {plural(n, 'новая работа', 'новые работы', 'новых работ')}
            {block.more_count > 1 && <> · ещё {block.more_count}</>}
          </span>
        </span>
      </span>
      <PeekChevron />
    </button>
  );
}

const PeekChevron = () => (
  <span className="alp-peek-chevron" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6" />
    </svg>
  </span>
);

const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
};

function Announcements({ block }: { block: AnnouncementsBlock }) {
  const t = useToggle();
  return (
    <article className={`post toggle ann-widget${t.cls}`}>
      <AnnouncementsPeek block={block} onOpen={t.open} />
      <div className="post-head">
        {t.button}
        <h2>
          <a href="/archive/category/announcement/">ОБЪЯВЛЕНИЯ</a>
        </h2>
        <div className="post-head-icons">
          <i className="post-ann-icon">
            <a href="/archive/category/announcement/" aria-label="Объявления">
              <Exclam className="icon-exclam" />
            </a>
          </i>
        </div>
      </div>
      {block.items.map((i) => (
        <a key={i.url} href={i.url} className="aw-item toggle-d">
          <span title={formatFullDate(i.date)}>{formatDate(i.date)}</span>
          <h3>{i.title}</h3>
          <p>{i.text}</p>
        </a>
      ))}
    </article>
  );
}

/**
 * «Нетленка» — случайные цитаты (ears). Вместо слайдера — карточка цитаты: крупная кавычка,
 * текст, подпись «автор · текст». Цитаты сменяют друг друга плавно (сами — раз в 9 секунд,
 * пока курсор не над блоком), листаются стрелками, точками и свайпом. Все цитаты лежат друг
 * на друге в одной ячейке: высота блока — по самой длинной, раскладка ленты не прыгает.
 * Свёрнутый на телефоне — кавычка и цитата одной строкой.
 */
const EARS_AUTOPLAY_MS = 9000;

function Ears({ block }: { block: EarsBlock }) {
  const t = useToggle();
  const items = block.items;
  const n = items.length;
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [tick, setTick] = useState(0); // любое действие — отсчёт автосмены заново
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const go = (d: number) => {
    setIndex((v) => (v + d + n) % n);
    setTick((x) => x + 1);
  };

  useEffect(() => {
    if (n < 2 || hover || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setTimeout(() => setIndex((v) => (v + 1) % n), EARS_AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [n, hover, index, tick]);

  return (
    <article className={`post toggle alp-ears${t.cls}`} id="post-ear">
      <button type="button" className="alp-peek alp-peek--quote" onClick={t.open} aria-label="Нетленка. Развернуть">
        <span className="alp-peek-mark" aria-hidden="true">
          “
        </span>
        <span className="alp-peek-body">
          <span className="alp-peek-label">Нетленка</span>
          <span className="alp-peek-quote">{items[0]?.text}</span>
        </span>
        <PeekChevron />
      </button>
      <div className="post-head">
        {t.button}
        <h2>НЕТЛЕНКА</h2>
      </div>
      <div className="alp-quotes toggle-d" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div
          className="alp-quotes-stage"
          aria-roledescription="карусель"
          aria-label="Цитаты"
          onPointerDown={(e) => {
            swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          }}
          onPointerUp={(e) => {
            const s0 = swipe.current;
            swipe.current = null;
            if (!s0 || s0.id !== e.pointerId) return;
            const dx = e.clientX - s0.x;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s0.y) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          {items.map((q, k) => (
            <figure key={q.url + k} className="alp-quote" data-active={k === index || undefined} aria-hidden={k !== index}>
              <span className="alp-quote-mark" aria-hidden="true">
                “
              </span>
              <blockquote>
                <a href={q.url} tabIndex={k === index ? 0 : -1}>
                  {q.text}
                </a>
              </blockquote>
              {(q.author || q.title) && (
                <figcaption>
                  {q.author && <span className="alp-quote-author">{q.author}</span>}
                  {q.author && q.title && ' · '}
                  {q.title && (
                    <a href={q.url} tabIndex={k === index ? 0 : -1}>
                      {q.title}
                    </a>
                  )}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
        {n > 1 && (
          <div className="alp-quotes-nav">
            <button type="button" className="alp-quotes-arrow" onClick={() => go(-1)} aria-label="Предыдущая цитата">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <span className="alp-quotes-dots">
              {items.map((_, k) => (
                <button
                  key={k}
                  type="button"
                  className="alp-quotes-dot"
                  data-active={k === index || undefined}
                  aria-label={`Цитата ${k + 1}`}
                  aria-current={k === index || undefined}
                  onClick={() => {
                    setIndex(k);
                    setTick((x) => x + 1);
                  }}
                />
              ))}
            </span>
            <button type="button" className="alp-quotes-arrow" onClick={() => go(1)} aria-label="Следующая цитата">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function Widget1({ block }: { block: Widget1Block }) {
  const t = useToggle();
  return (
    <article className={`post toggle widget-1${t.cls}`}>
      <Widget1Peek block={block} onOpen={t.open} />
      <div className="post-head">
        {t.button}
        <h2>
          <a href={block.url}>{block.title}</a>
        </h2>
      </div>
      {block.posts.map((p) => (
        <a key={p.url} href={p.url} className="widget-1-item toggle-d">
          <div className="w1i-head">
            <img className="av" src={p.author.avatar || NO_AVATAR} alt={p.author.username} />
            <span className="name">{displayName(p.author)}</span>
            <span className="dt" title={formatFullDate(p.date)}>
              {formatDate(p.date)}
            </span>
          </div>
          <h3>{p.title}</h3>
        </a>
      ))}
      {block.more_count > 1 && (
        <a className="widget-1-link toggle-d" href={block.url}>
          Ещё креативов: {block.more_count}
        </a>
      )}
    </article>
  );
}

/** Блоки над лентой — в порядке из SiteParams index_fixed_blocks. */
export function renderBlock(block: Block, i: number) {
  switch (block.type) {
    case 'announcements':
      return <Announcements key={`b${i}`} block={block} />;
    case 'iod':
      return <Iod key={`b${i}`} block={block} />;
    case 'ears':
      return <Ears key={`b${i}`} block={block} />;
    case 'widget1':
      return <Widget1 key={`b${i}`} block={block} />;
    case 'pin':
      return <PostCard key={`pin-${block.post.id}`} card={block.post} />;
    default:
      return null;
  }
}
