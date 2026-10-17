import { useState } from 'react';
import type { AnnouncementsBlock, Block, EarsBlock, Widget1Block } from '../types';
import { formatDate, formatFullDate } from '../date';
import { ArrowNext, Exclam } from '../icons';
import { NO_AVATAR, displayName } from '../card/Author';
import PostCard from '../card/PostCard';
import Slider from './Slider';
import Iod from './Iod';

/** Сворачиваемый блок (article.post.toggle): стрелка в шапке, класс toggled. */
function useToggle() {
  const [toggled, setToggled] = useState(false);
  return {
    cls: toggled ? ' toggled' : '',
    button: (
      <button className="post-toggle-btn" type="button" onClick={() => setToggled((v) => !v)} aria-label="Свернуть или развернуть">
        <ArrowNext />
      </button>
    ),
  };
}

function Announcements({ block }: { block: AnnouncementsBlock }) {
  const t = useToggle();
  return (
    <article className={`post toggle ann-widget${t.cls}`}>
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
