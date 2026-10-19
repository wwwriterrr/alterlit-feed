# alterlit-posts

Лента постов alterlit.ru — остров React + TypeScript + Vite + RTK Query. Заменяет старую ленту
(`archive` POST `method=get-posts` → `parts/post_list_v2.html` + masonry.js + обработчики в `base.html`).
Сервер отдаёт только данные (`GET /api/v1/feed/`, бэк — `django/feed_patch.py`), разметку рисует остров
теми же классами, что старый шаблон, — карточки оформляют стили сайта.

Сейчас перенесена главная Альтерлита (раздел `index`); остальные разделы бэк отдаёт 404 —
остров показывает «Этот раздел пока открывается в старой ленте».

## Подключение в шаблон

Вместо `<div class="posts-list" data-async="true" …>` и скриптов старой ленты на этой странице:

```django
<link rel="stylesheet" href="/assets/posts/posts.css?v=1.00">
<div id="alterlit-posts" data-section="index" data-csrf="{{ csrf_token }}"></div>
<script type="module" src="/assets/posts/posts.js?v=1.00"></script>
```

- Контейнер — не `.posts-list`: этот класс ищут старые скрипты (masonry, подгрузка), остров их не трогает.
- Клики внутри острова не всплывают до делегированных обработчиков `base.html` (лайк, «…», удалить,
  скрыть, свернуть), иначе действие выполнится дважды. Исключение — `img.smart-view` (картинка дня):
  её открывает общий просмотрщик сайта.

## Что делает остров

- Колонки как у masonry.js (шаг = ширина карточки + отступ из стилей сайта); догрузка страниц по 21
  при прокрутке; курсор `before=<id последнего поста>`.
- Блоки главной из `SiteParams.index_fixed_blocks`: объявления, картинка дня, случайные цитаты,
  «Виджет 1», закреплённый пост.
- Действия: лайк (`POST /likes/post/<id>/`), «Поделиться», «Сохранить в избранное» (как на сайте —
  только анимация), редактировать (`/post/edit/?id=`), пожаловаться (`POST /api/v1/support/task/session/`,
  гость указывает email), удалить (`POST /post/<id>/ method=delete-post`), скрыть / показать
  (`PATCH /api/v1/posts/<id>/`), свернуть блок.

## Разработка

```sh
npm install
npm run dev        # http://localhost:5181
npm run build      # dist/posts.js, dist/posts.css — статические имена, версия через ?v= в шаблоне
```

`.env.local` (в git не попадает):

- `BACKEND_URL`, `DEV_COOKIE` — прокси на сервер с чужой сессией, как в других островах;
- `DEV_COOKIE_ADMIN` и `DEV_AS=admin` — смотреть ленту глазами администратора (статусы в профилях,
  пункты «(админ)» в меню); без `DEV_AS` — снова обычный пользователь;
- `DEV_FIXTURES=1` — лента из `dev-fixtures/feed.json`, а лайк, удаление, скрытие и жалоба отвечают
  заглушками: на сервер ничего не уходит.

`dev-fixtures/site.css` — снимок стилей сайта для dev-страницы.
