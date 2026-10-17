import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import { setCsrfFallback } from './api';
import Feed from './Feed';
import './posts.css';

// Шаблон: <div id="alterlit-posts" data-section="index" data-csrf="{{ csrf_token }}"></div>
const rootEl = document.getElementById('alterlit-posts');
if (rootEl) {
  setCsrfFallback(rootEl.dataset.csrf ?? '');

  // Обработчики старой ленты в base.html висят делегированием на #alterlit и body
  // (лайк, «…», удалить, скрыть, свернуть) — клики острова до них не доходят, иначе
  // действие выполнится дважды. Пропускаем только картинки smart-view: их открывает
  // общий просмотрщик сайта.
  rootEl.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target?.closest?.('img.smart-view')) e.stopPropagation();
  });

  createRoot(rootEl).render(
    <StrictMode>
      <Provider store={store}>
        <Feed section={rootEl.dataset.section || 'index'} />
      </Provider>
    </StrictMode>,
  );
}
