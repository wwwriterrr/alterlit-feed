/**
 * Единое окно просмотра картинок сайта (viewer.js острова images, подключён в base.html).
 * Открывается событием alterlit:open-image; ответ — alterlit:image-closed / alterlit:image-liked.
 * Если viewer.js на странице нет — обычный переход на страницу картинки.
 */
declare global {
  interface Window {
    alterlitViewer?: { version: number; open: (detail: unknown) => void };
  }
}

export const IMAGE_CLOSED_EVENT = 'alterlit:image-closed';

/** Открыть картинку id; ids — набор для листания ← →; fallbackHref — куда идти без окна. */
export function openImage(id: number, ids: number[], fallbackHref: string) {
  if (!window.alterlitViewer) {
    window.location.href = fallbackHref;
    return;
  }
  window.dispatchEvent(new CustomEvent('alterlit:open-image', { detail: { id, ids } }));
}
