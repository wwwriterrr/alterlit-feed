import { useEffect, useMemo, useRef } from 'react';
import { useFeedInfiniteQuery } from './api';
import { ANON, FeedContext } from './FeedContext';
import { useMasonry } from './useMasonry';
import { renderBlock } from './blocks/Blocks';
import PostCard from './card/PostCard';
import Skeleton from './card/Skeleton';
import { DialogsProvider } from './dialogs/DialogsProvider';

/** Сколько заглушек показывать: первая загрузка — на пару экранов, догрузка — по одной в колонку. */
const SKELETONS_FIRST = 9;
const SKELETONS_MORE = 3;

/** Догружаем следующую страницу, когда до конца ленты остаётся ~полтора экрана. */
const PRELOAD_MARGIN = '1500px 0px';

export default function Feed({ section }: { section: string }) {
  const { data, error, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError, refetch } =
    useFeedInfiniteQuery(section);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useMasonry(listRef);

  const pages = data?.pages ?? [];
  const viewer = pages[0]?.viewer ?? ANON;
  const ctx = useMemo(() => ({ section, viewer }), [section, viewer]);

  // пост мог прийти на двух страницах подряд (опубликовали новый во время чтения) — показываем один раз
  const posts = useMemo(() => {
    const seen = new Set<number>();
    return pages.flatMap((p) => p.posts).filter((c) => !seen.has(c.id) && seen.add(c.id));
  }, [pages]);
  const blocks = pages[0]?.blocks ?? [];

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage && !isError) fetchNextPage();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage, posts.length]);

  return (
    <FeedContext.Provider value={ctx}>
      <DialogsProvider>
        {/* не .posts-list: этот класс ищут старые скрипты ленты (masonry, подгрузка) */}
        <div className="alp-list" ref={listRef} data-type={section}>
          {blocks.map(renderBlock)}
          {posts.map((c) => (
            <PostCard key={c.id} card={c} />
          ))}
          {(isLoading || isFetchingNextPage) &&
            Array.from({ length: isLoading ? SKELETONS_FIRST : SKELETONS_MORE }, (_, i) => (
              <Skeleton key={`skel-${i}`} variant={i + posts.length} />
            ))}
        </div>
        <div ref={sentinel} className="alp-sentinel" />
        {(isLoading || isFetchingNextPage) && (
          // для экранных дикторов; видимый индикатор — заглушки карточек
          <div className="alp-sr-only" role="status">
            Загружаем публикации…
          </div>
        )}
        {isError && (
          <div className="alp-status" role="alert">
            {errorMessage(error, section)}{' '}
            {(error as { status?: unknown } | undefined)?.status !== 404 && (
              <button type="button" className="alp-retry" onClick={() => (pages.length ? fetchNextPage() : refetch())}>
                Повторить
              </button>
            )}
          </div>
        )}
        {!isLoading && !isError && !hasNextPage && pages.length > 0 && !posts.length && (
          <div className="alp-status">{isReviews(section) ? 'Рецензий пока нет' : 'Публикаций пока нет'}</div>
        )}
      </DialogsProvider>
    </FeedContext.Provider>
  );
}

const isReviews = (section: string) => section.startsWith('reviews:') || section.endsWith(':reviews');

/** 404 от ленты: not_found — нет рубрики / публикации / пользователя; not_migrated — раздел ещё в старой ленте. */
function errorMessage(error: unknown, section: string) {
  const e = error as { status?: unknown; data?: { code?: string } } | undefined;
  if (e?.status === 404) {
    if (e.data?.code !== 'not_found') return 'Этот раздел пока открывается в старой ленте.';
    if (section.startsWith('reviews:')) return 'Публикация не найдена.';
    if (section.startsWith('profile:')) return 'Пользователь не найден.';
    return 'Такой рубрики нет.';
  }
  return 'Не удалось загрузить публикации.';
}
