import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowNext, SliderPrev } from '../icons';

/**
 * Слайдер с разметкой lightSlider (item: 1, loop) — стили сайта для .lSSlideOuter, .lSPager,
 * .lSBPrev/.lSBNext применяются как раньше; сам jQuery-плагин не нужен.
 */
export default function Slider({ slides, itemClass }: { slides: ReactNode[]; itemClass: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const drag = useRef<{ x: number; dx: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const n = slides.length;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const goTo = (i: number) => setIndex(((i % n) + n) % n);
  const step = (d: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    goTo(index + d);
  };

  // свайп и перетаскивание мышью
  const onPointerDown = (e: React.PointerEvent) => {
    if (n < 2 || e.button !== 0) return;
    drag.current = { x: e.clientX, dx: 0, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x;
    if (Math.abs(d.dx) > 5) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDx(d.dx);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDx(0);
    if (d && Math.abs(d.dx) > Math.min(60, width / 5)) goTo(index + (d.dx < 0 ? 1 : -1));
  };
  // после перетаскивания клик по картинке не должен открывать просмотр
  const onClickCapture = (e: React.MouseEvent) => {
    if (Math.abs(dx) > 5) e.stopPropagation();
  };

  return (
    <div className="lSSlideOuter">
      <div className="lSSlideWrapper usingCss" ref={wrap}>
        <ul
          className={`post-slider lightSlider lSSlide${n > 1 ? ' lsGrab' : ''}`}
          style={{
            width: width ? width * n : undefined,
            transform: `translate3d(${-index * width + dx}px, 0, 0)`,
            transitionDuration: drag.current ? '0s' : '400ms',
            paddingBottom: '0%',
            touchAction: 'pan-y',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={onClickCapture}
        >
          {slides.map((slide, i) => (
            <li
              key={i}
              className={`${itemClass} lslide${i === index ? ' active' : ''}`}
              style={{ width: width || undefined, marginRight: 0 }}
              aria-hidden={i !== index}
            >
              {slide}
            </li>
          ))}
        </ul>
      </div>
      {n > 1 && (
        <>
          <a href="#" className="lSBPrev" onClick={step(-1)} aria-label="Назад">
            <SliderPrev />
          </a>
          <ul className="lSPager lSpg" style={{ marginTop: 5 }}>
            {slides.map((_, i) => (
              <li key={i} className={i === index ? 'active' : undefined}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(i);
                  }}
                >
                  {i + 1}
                </a>
              </li>
            ))}
          </ul>
          <a href="#" className="lSBNext" onClick={step(1)} aria-label="Вперёд">
            <ArrowNext />
          </a>
        </>
      )}
    </div>
  );
}
