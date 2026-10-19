import { useEffect, useSyncExternalStore } from 'react';

/**
 * Маршруты острова: адрес страницы ↔ что показывать. Один источник правды и для первой
 * загрузки, и для навигации без перезагрузки (history API).
 *
 *   /                           → лента главной (section index)
 *   /archive/category/<slug>/   → рубрика (category:<slug>; litpotok, konkursy — тоже рубрики)
 *   /archive/reviews/<id>/      → рецензии на публикацию (reviews:<id>)
 *   /profile/<username>/        → публикации пользователя (profile:<username>; ?posts=reviews → …:reviews)
 *   /post/<id>/                 → одиночная публикация — маршрут заведён заранее, страница будет позже
 */
export type Route = { kind: 'feed'; section: string } | { kind: 'post'; id: number };

export function parseRoute(url: URL | Location): Route | null {
  const { pathname, search } = url;
  if (pathname === '/' || pathname === '') return { kind: 'feed', section: 'index' };
  let m = /^\/archive\/category\/([^/]+)\/?$/.exec(pathname);
  if (m) return { kind: 'feed', section: `category:${decodeURIComponent(m[1])}` };
  m = /^\/archive\/reviews\/(\d+)\/?$/.exec(pathname);
  if (m) return { kind: 'feed', section: `reviews:${m[1]}` };
  m = /^\/profile\/([^/]+)\/?$/.exec(pathname);
  if (m) {
    const reviews = new URLSearchParams(search).get('posts') === 'reviews';
    return { kind: 'feed', section: `profile:${decodeURIComponent(m[1])}${reviews ? ':reviews' : ''}` };
  }
  m = /^\/post\/(\d+)\/?$/.exec(pathname);
  if (m) return { kind: 'post', id: Number(m[1]) };
  return null;
}

/**
 * Какие маршруты остров открывает сам, без перезагрузки. Пока пусто: шапку раздела (название
 * рубрики, профиль) рисует шаблон Django, и при переходе между разделами она бы не сменилась.
 * Появится одиночная публикация — сюда добавится 'post'.
 */
const CLIENT_KINDS: ReadonlySet<Route['kind']> = new Set();

// ── текущий адрес как внешнее хранилище для React ─────────────────────────────
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener('popstate', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('popstate', l);
  };
};
const snapshot = () => window.location.href;

/** Текущий адрес (перерисовка при navigate и «Назад»/«Вперёд»). */
export function useLocationHref() {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Позиция прокрутки — в записи истории: «Назад» возвращает туда, где читатель был. */
function rememberScroll() {
  window.history.replaceState({ ...window.history.state, alpScroll: window.scrollY }, '');
}

/** Переход без перезагрузки (только для маршрутов из CLIENT_KINDS — иначе обычный переход). */
export function navigate(href: string) {
  const url = new URL(href, window.location.href);
  const route = parseRoute(url);
  if (!route || !CLIENT_KINDS.has(route.kind) || url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  rememberScroll();
  window.history.pushState({ alpScroll: 0 }, '', url.pathname + url.search + url.hash);
  window.scrollTo(0, 0);
  notify();
}

/**
 * Ссылки внутри острова: обычный клик по ссылке на маршрут, который остров открывает сам, —
 * переход без перезагрузки. Средняя кнопка, Ctrl/Cmd/Shift, target=_blank — как обычно.
 */
export function interceptLinks(root: HTMLElement) {
  root.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const route = parseRoute(url);
    if (!route || !CLIENT_KINDS.has(route.kind)) return;
    e.preventDefault();
    navigate(url.href);
  });
}

/** «Назад»/«Вперёд» по своим записям — прокрутка туда, где была (после отрисовки). */
export function useScrollRestoration(key: string) {
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const y = (window.history.state as { alpScroll?: number } | null)?.alpScroll;
    if (typeof y === 'number' && y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [key]);
}
