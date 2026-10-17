import { createApi, fetchBaseQuery, type FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { Card, FeedPage } from './types';

let csrfFallback = '';
/** Токен CSRF, если куки csrftoken нет: <div id="alterlit-posts" data-csrf="{{ csrf_token }}"> */
export function setCsrfFallback(token: string) {
  csrfFallback = token;
}

export function csrfToken() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : csrfFallback;
}

/**
 * Старые ручки сайта (лайк, удаление) — обычная форма. Токен CSRF только в заголовке X-CSRFToken
 * (prepareHeaders): csrfmiddlewaretoken в теле Django проверяет раньше заголовка, а в dev-прокси
 * кука подменяется на DEV_COOKIE — токен браузера из тела с ней не совпадает.
 */
const form = (data: Record<string, string>) => {
  const body = new URLSearchParams(data);
  return { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
};

/** Старые ручки отвечают 200 и кодом в теле: {"code": 403, "msg": "…"} */
interface LegacyReply {
  code: number;
  msg?: string;
}

export class LegacyError extends Error {
  /** строкой: RTK Query сохраняет у ошибки только строковый code */
  code: string;
  constructor(message: string, code: number) {
    super(message);
    this.code = String(code);
  }
}

const legacy = <T extends LegacyReply>(r: T) => {
  if (r.code !== 200) throw new LegacyError(r.msg || 'Возникла ошибка на сервере. Попробуйте позже.', r.code);
  return r;
};

/**
 * Сервер не считает пользователя вошедшим (сессия истекла, пока открыта страница):
 * 401/403 от ручки, код 401/403 в теле старой ручки или HTML страницы входа вместо JSON.
 */
export function isAuthError(err: unknown) {
  const e = err as { status?: unknown; originalStatus?: number; code?: string; data?: unknown };
  if (!e || typeof e !== 'object') return false;
  if (e.status === 401 || e.status === 403) return true;
  // ответ не JSON (страница ошибки Django) — RTK Query кладёт статус в originalStatus
  if (e.originalStatus === 401 || e.originalStatus === 403) return true;
  if (e.code === '401' || e.code === '403') return true;
  return e.status === 'PARSING_ERROR' && typeof e.data === 'string' && /<form[^>]*(login|auth)/i.test(e.data);
}

/** Текст ошибки для окна: detail DRF, msg старой ручки или общий. */
export function errorText(err: unknown) {
  const e = err as FetchBaseQueryError & { message?: string };
  if (e && typeof e === 'object') {
    if ('data' in e && e.data && typeof e.data === 'object') {
      const d = e.data as { detail?: string; msg?: string };
      if (d.detail || d.msg) return d.detail || d.msg!;
    }
    if (e.status === 403) return 'Сессия истекла — обновите страницу и войдите снова.';
    if (e.message) return e.message;
  }
  return 'Возникла ошибка на сервере. Попробуйте позже.';
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/',
    credentials: 'same-origin',
    prepareHeaders: (headers) => {
      headers.set('Accept', 'application/json');
      const token = csrfToken();
      if (token) headers.set('X-CSRFToken', token);
      return headers;
    },
  }),
  endpoints: (build) => ({
    /** Лента раздела: страницы по 21, следующая — до id последнего показанного поста. */
    feed: build.infiniteQuery<FeedPage, string, number | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (last) => (last.more && last.posts.length ? last.posts[last.posts.length - 1].id : undefined),
      },
      query: ({ queryArg, pageParam }) =>
        `api/v1/feed/?section=${encodeURIComponent(queryArg)}${pageParam ? `&before=${pageParam}` : ''}`,
    }),

    /** Лайк — переключатель: POST /likes/post/<id>/ → {code, count} */
    like: build.mutation<{ count: number }, { id: number; section: string }>({
      query: ({ id }) => ({ url: `likes/post/${id}/`, ...form({}) }),
      transformResponse: (r: LegacyReply & { count: number }) => legacy(r),
      // как в комментариях: сердце и счётчик меняем сразу, ответ сервера только уточняет
      // число (кто-то лайкнул одновременно); ошибка — возвращаем как было
      async onQueryStarted({ id, section }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          updateCard(section, id, (c) => {
            c.counts.liked = !c.counts.liked;
            c.counts.likes = Math.max(0, c.counts.likes + (c.counts.liked ? 1 : -1));
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            updateCard(section, id, (c) => {
              c.counts.likes = data.count;
            }),
          );
        } catch {
          patch.undo();
        }
      },
    }),

    /** Удаление: POST /post/<id>/ method=delete-post (автор или blog.delete_post) */
    deletePost: build.mutation<LegacyReply, { id: number; section: string }>({
      query: ({ id }) => ({ url: `post/${id}/`, ...form({ method: 'delete-post' }) }),
      transformResponse: (r: LegacyReply) => legacy(r),
      async onQueryStarted({ id, section }, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(removeCard(section, id));
        } catch {
          /* ошибку показывает окно */
        }
      },
    }),

    /** Скрыть / вернуть: PATCH /api/v1/posts/<id>/ {status: "hidden" | "old_status"} → пост со статусом */
    toggleHidden: build.mutation<{ status: Card['status'] }, { id: number; hidden: boolean; section: string }>({
      query: ({ id, hidden }) => ({
        url: `api/v1/posts/${id}/`,
        method: 'PATCH',
        body: { status: hidden ? 'old_status' : 'hidden' },
      }),
      async onQueryStarted({ id, section }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data?.status) {
            dispatch(
              updateCard(section, id, (c) => {
                c.status = data.status;
              }),
            );
          }
        } catch {
          /* как раньше — молча */
        }
      },
    }),

    /** Жалоба на пост — задачей в поддержку, как жалоба на комментарий (аноним указывает email). */
    complaint: build.mutation<unknown, { id: number; text: string; email?: string }>({
      query: ({ id, text, email }) => {
        const body = new FormData();
        body.set('content_type', 'post');
        body.set('object_id', String(id));
        body.set('text', text);
        if (email) body.set('email', email);
        return { url: 'api/v1/support/task/session/', method: 'POST', body };
      },
    }),
  }),
});

/** Правка карточки во всех загруженных страницах раздела (и в закреплённом блоке). */
function updateCard(section: string, id: number, fn: (c: Card) => void) {
  return api.util.updateQueryData('feed', section, (draft) => {
    for (const page of draft.pages) {
      page.posts.forEach((c) => c.id === id && fn(c));
      page.blocks?.forEach((b) => b.type === 'pin' && b.post.id === id && fn(b.post));
    }
  });
}

function removeCard(section: string, id: number) {
  return api.util.updateQueryData('feed', section, (draft) => {
    for (const page of draft.pages) {
      page.posts = page.posts.filter((c) => c.id !== id);
      if (page.blocks) page.blocks = page.blocks.filter((b) => !(b.type === 'pin' && b.post.id === id));
    }
  });
}

export const { useFeedInfiniteQuery, useLikeMutation, useDeletePostMutation, useToggleHiddenMutation, useComplaintMutation } =
  api;
