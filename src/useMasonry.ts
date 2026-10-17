import { useLayoutEffect, type RefObject } from 'react';

/**
 * Раскладка карточек колонками, как masonry.js на старой ленте: каждая следующая карточка —
 * в самую короткую колонку, шаг колонки = ширина карточки + margin-right (стили сайта).
 * Порядок раскладки не меняется, поэтому догруженные страницы не двигают показанные карточки;
 * пересчёт — при изменении размеров (картинка загрузилась, блок свернули) и состава.
 */
export function useMasonry(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    let frame = 0;

    const layout = () => {
      frame = 0;
      const items = Array.from(box.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
      if (!items.length) {
        box.style.height = '';
        return;
      }
      const first = getComputedStyle(items[0]);
      const step = items[0].offsetWidth + parseFloat(first.marginRight || '0');
      const cols = Math.max(1, Math.floor((box.clientWidth + 1) / step));
      const heights = new Array<number>(cols).fill(0);
      for (const el of items) {
        let col = 0;
        for (let c = 1; c < cols; c++) if (heights[c] < heights[col] - 0.5) col = c;
        const st = getComputedStyle(el);
        el.style.position = 'absolute';
        el.style.left = `${col * step}px`;
        el.style.top = `${heights[col]}px`;
        heights[col] += el.offsetHeight + parseFloat(st.marginTop || '0') + parseFloat(st.marginBottom || '0');
      }
      box.style.height = `${Math.max(...heights)}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(layout);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    const watch = () => Array.from(box.children).forEach((el) => ro.observe(el));
    watch();
    const mo = new MutationObserver(() => {
      watch();
      schedule();
    });
    mo.observe(box, { childList: true });
    layout();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref]);
}
