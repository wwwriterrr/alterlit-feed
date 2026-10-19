import { useCallback, useEffect, useRef, useState } from 'react';
import type { IodBlock } from '../types';
import s from './Iod.module.css';
import { IMAGE_CLOSED_EVENT, openImage } from '../viewer';

const GALLERY = '/archive/images/image_of_day/';
/** Через сколько бездействия листать вперёд. */
const AUTOPLAY_MS = 10_000;
/** Сдвиг мышью, после которого это перетаскивание, а не клик. */
const DRAG_THRESHOLD = 6;

/**
 * «Картинка дня» — 4 последние картинки рубрики.
 * Лента слайдов на scroll-snap: свайп пальцем, перетаскивание мышью, колесо/тачпад, стрелки
 * и миниатюры под картинкой (на самой картинке ничего не лежит). Через 10 секунд бездействия
 * листает вперёд; пауза, пока курсор над картинкой, блок вне экрана или вкладка скрыта.
 * Картинка вписана целиком (на них часто текст), поле вокруг — её же размытое превью.
 * Клик по картинке открывает единое окно просмотра (viewer.js) с листанием всех четырёх;
 * пока окно открыто, автолистание стоит.
 */
export default function Iod({ block }: { block: IodBlock }) {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // любое действие пользователя перезапускает отсчёт автолистания
  const [activity, setActivity] = useState(0);
  const [hover, setHover] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  const [dragging, setDragging] = useState(false);
  // открыто окно просмотра — картинка за ним не листается
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    const onClosed = () => {
      setViewing(false);
      setActivity((a) => a + 1); // отсчёт до автолистания — заново
    };
    window.addEventListener(IMAGE_CLOSED_EVENT, onClosed);
    return () => window.removeEventListener(IMAGE_CLOSED_EVENT, onClosed);
  }, []);
  const drag = useRef<{ x: number; left: number; id: number; moved: boolean } | null>(null);
  const dragJustEnded = useRef(false);
  const items = block.items;
  const n = items.length;
  const ids = items.map((i) => i.id);
  const touch = useCallback(() => setActivity((a) => a + 1), []);
  // счётчик «2 / 4» виден при наведении; на телефоне (наведения нет) — коротко после действия
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!activity) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1500);
    return () => clearTimeout(t);
  }, [activity]);

  // активный слайд — по положению прокрутки (свайп, колесо, стрелки — всё через неё)
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setIndex(Math.min(n - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [n]);

  const goTo = useCallback(
    (i: number, smooth = true) => {
      const el = track.current;
      if (!el) return;
      const next = (i + n) % n; // по кругу, как раньше
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: next * el.clientWidth, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    },
    [n],
  );

  // блок на экране и вкладка видна — иначе автолистание стоит
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    const onVis = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const paused = n < 2 || hover || dragging || viewing || !onScreen || !pageVisible;
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => goTo(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [paused, index, activity, goTo]);

  // перетаскивание мышью (палец листает нативно, через scroll-snap)
  const onPointerDown = (e: React.PointerEvent) => {
    touch();
    if (e.pointerType !== 'mouse' || e.button !== 0 || n < 2) return;
    drag.current = { x: e.clientX, left: track.current!.scrollLeft, id: e.pointerId, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = track.current;
    if (!d || !el || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.left - dx;
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = track.current;
    drag.current = null;
    if (!d?.moved || !el) return;
    setDragging(false);
    const dx = e.clientX - d.x;
    const from = Math.round(d.left / el.clientWidth);
    // хватит и небольшого рывка: 15% ширины — следующая/предыдущая
    const to = Math.abs(dx) > el.clientWidth * 0.15 ? from + (dx < 0 ? 1 : -1) : from;
    // без перехода по кругу: тянут — значит, к соседней
    el.scrollTo({ left: Math.min(n - 1, Math.max(0, to)) * el.clientWidth, behavior: 'smooth' });
  };
  // после перетаскивания клик не должен открывать просмотр
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragJustEnded.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  useEffect(() => {
    if (dragging) dragJustEnded.current = true;
    else {
      const t = window.setTimeout(() => (dragJustEnded.current = false), 0);
      return () => clearTimeout(t);
    }
  }, [dragging]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      touch();
      goTo(index + (e.key === 'ArrowLeft' ? -1 : 1));
    }
  };

  const step = (d: number) => () => {
    touch();
    goTo(index + d);
  };

  return (
    <article ref={root} className={`post ${s.iod}`} id="post-iod">
      <div className="post-head">
        <h2>
          <a href={GALLERY}>КАРТИНКА ДНЯ</a>
        </h2>
      </div>

      <div className={s.stage} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div
          ref={track}
          className={s.track}
          data-dragging={dragging || undefined}
          tabIndex={0}
          role="region"
          aria-roledescription="карусель"
          aria-label="Картинка дня"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={touch}
          onTouchStart={touch}
          onClickCapture={onClickCapture}
        >
          {items.map((img, i) => (
            <figure
              key={img.id}
              className={s.slide}
              aria-roledescription="слайд"
              aria-label={`${i + 1} из ${n}`}
              aria-hidden={i !== index}
            >
              {/* размытое превью — фон под вписанной картинкой */}
              <span className={s.backdrop} style={{ backgroundImage: `url(${img.preload})` }} aria-hidden="true" />
              <img
                id={`image-${img.id}`}
                className={s.img}
                src={img.src}
                onClick={() => {
                  setViewing(true);
                  openImage(img.id, ids, img.href);
                }}
                alt={img.descr || `Картинка дня ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
              />
              {img.descr && <figcaption className={s.caption}>{img.descr}</figcaption>}
            </figure>
          ))}
        </div>
        {n > 1 && (
          <span className={s.counter} data-flash={flash || undefined} aria-hidden="true">
            {index + 1} / {n}
          </span>
        )}
      </div>

      {n > 1 && (
        <div className={s.controls}>
          <button type="button" className={s.arrow} onClick={step(-1)} aria-label="Предыдущая картинка">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className={s.thumbs} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {items.map((img, i) => (
              <button
                key={img.id}
                type="button"
                className={s.thumb}
                data-active={i === index || undefined}
                aria-label={`Картинка ${i + 1}`}
                aria-current={i === index || undefined}
                onClick={() => {
                  touch();
                  goTo(i);
                }}
              >
                <img src={img.src} alt="" loading="lazy" draggable={false} />
                {/* полоска до автолистания; на паузе её нет, после паузы и любого действия — отсчёт заново
                    (как и сам таймер) */}
                {i === index && !paused && <span key={`${index}-${activity}`} className={s.timer} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <button type="button" className={s.arrow} onClick={step(1)} aria-label="Следующая картинка">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      <a className={`post-action ${s.action}`} href={GALLERY}>
        В галерею
      </a>
    </article>
  );
}
