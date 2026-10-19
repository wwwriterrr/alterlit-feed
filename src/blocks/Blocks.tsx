import { useEffect, useState } from 'react';
import type { AnnouncementsBlock, Block, EarsBlock, Widget1Block } from '../types';
import { formatDate, formatFullDate } from '../date';
import { ArrowNext, Exclam } from '../icons';
import { NO_AVATAR, displayName } from '../card/Author';
import PostCard from '../card/PostCard';
import Slider from './Slider';
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

function Ears({ block }: { block: EarsBlock }) {
  return (
    <article className="post" id="post-ear">
      <div className="post-head">
        <h2>СЛУЧАЙНЫЕ ЦИТАТЫ</h2>
      </div>
      <Slider
        itemClass="sl-item short"
        slides={block.items.map((i) => (
          <blockquote>
            <a href={i.url}>
              <span>{i.text}</span>
            </a>
          </blockquote>
        ))}
      />
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
      // widget2 — разметки в старой ленте нет (на главной сейчас не используется)
      return null;
  }
}
