import type { AppDispatch } from './storeTypes';
import { api } from './api';
import type { FeedPage } from './types';

/**
 * Возврат к ленте кнопкой «Назад» после перехода в публикацию (обычный переход, с перезагрузкой
 * страницы). Браузер загружает страницу заново, и лента начиналась бы с первой страницы и верха.
 * Поэтому при уходе со страницы сохраняем в sessionStorage вкладки загруженные страницы ленты и
 * прокрутку, а при возврате «Назад» показываем ленту из сохранённого сразу и прокручиваем туда,
 * где читатель был. Обычный заход и обновление страницы — как раньше, с начала.
 */
const PREFIX = 'alp-feed:';
/** Сохранённое старше — не используем (лента могла заметно измениться). */
const MAX_AGE_MS = 30 * 60 * 1000;
/** Больше страниц не храним: sessionStorage ограничен (~5 МБ). */
const MAX_PAGES = 12;

interface Saved {
  at: number;
  section: string;
  pages: FeedPage[];
  pageParams: (number | null)[];
  scrollY: number;
  /** карточка вверху экрана при уходе и её отступ от верха окна — к ней и возвращаемся:
   *  позиция в пикселях зависит от ширины окна, скелетонов и догрузок */
  anchor: { id: string; top: number } | null;
}

/** Restore: куда прокрутить — к карточке (если есть) или на пиксели. */
export interface RestorePoint {
  y: number;
  anchor: { id: string; top: number } | null;
}

/** Первая карточка ленты, видимая вверху окна. */
function topCard() {
  for (const el of document.querySelectorAll<HTMLElement>('.alp-list > article.post[id]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 80) return { id: el.id, top: Math.round(r.top) };
  }
  return null;
}

const keyOf = () => PREFIX + window.location.pathname + window.location.search;


/** Страница открыта кнопками «Назад» / «Вперёд». */
function isBackForward() {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === 'back_forward';
}

export function saveFeed(section: string, data: { pages: FeedPage[]; pageParams: (number | null)[] } | undefined) {
  if (!data?.pages.length) return;
  const saved: Saved = {
    at: Date.now(),
    section,
    pages: data.pages.slice(0, MAX_PAGES),
    pageParams: data.pageParams.slice(0, MAX_PAGES),
    scrollY: window.scrollY,
    anchor: topCard(),
  };
  try {
    sessionStorage.setItem(keyOf(), JSON.stringify(saved));
  } catch {
    /* переполнено или недоступно — вернёмся к началу ленты, как раньше */
  }
}

/**
 * Вызывается до первого запроса ленты: при возврате «Назад» кладёт сохранённые страницы в кэш
 * RTK Query (запроса не будет). -> позиция прокрутки для восстановления или null.
 */
let restored: { key: string; y: RestorePoint | null } | null = null;

export function restoreFeed(dispatch: AppDispatch, section: string): RestorePoint | null {
  // один раз на загрузку страницы (StrictMode в dev вызывает начальное состояние дважды)
  const key = keyOf() + '|' + section;
  if (restored?.key === key) return restored.y;
  const y = readSaved(dispatch, section);
  restored = { key, y };
  return y;
}

function readSaved(dispatch: AppDispatch, section: string): RestorePoint | null {
  let saved: Saved | null = null;
  try {
    const raw = sessionStorage.getItem(keyOf());
    sessionStorage.removeItem(keyOf());
    saved = raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
  if (!saved || !isBackForward() || saved.section !== section || Date.now() - saved.at > MAX_AGE_MS) return null;
  dispatch(api.util.upsertQueryData('feed', section, { pages: saved.pages, pageParams: saved.pageParams }));
  return { y: saved.scrollY, anchor: saved.anchor ?? null };
}
