import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import { setCsrfFallback } from './api';
import { interceptLinks } from './router';
import App from './App';
import './posts.css';

// Шаблон: <div id="alterlit-posts" data-section="index" data-csrf="{{ csrf_token }}"></div>
// Что показать, остров определяет по адресу (router.ts): /, /archive/category/<slug>/,
// /archive/reviews/<id>/, /profile/<username>/ (?posts=reviews). data-section — запасной вариант
// для страниц с другим адресом; в dev раздел можно задать и /?section=category:stihi.
const rootEl = document.getElementById('alterlit-posts');
if (rootEl) {
  setCsrfFallback(rootEl.dataset.csrf ?? '');

  // Обработчики старой ленты в base.html висят делегированием на #alterlit и body
  // (лайк, «…», удалить, скрыть, свернуть, просмотр smart-view) — клики острова до них
  // не доходят, иначе действие выполнится дважды. Картинки остров открывает сам — в едином
  // окне просмотра (viewer.ts).
  rootEl.addEventListener('click', (e) => e.stopPropagation());
  // ссылки на маршруты, которые остров открывает сам, — без перезагрузки
  interceptLinks(rootEl);

  createRoot(rootEl).render(
    <StrictMode>
      <Provider store={store}>
        <App fallbackSection={rootEl.dataset.section || 'index'} />
      </Provider>
    </StrictMode>,
  );
}
