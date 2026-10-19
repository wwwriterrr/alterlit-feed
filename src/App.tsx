import { useMemo } from 'react';
import Feed from './Feed';
import { parseRoute, useLocationHref, useScrollRestoration, type Route } from './router';

/**
 * Что показать — по адресу (router.ts). Шаблон может задать раздел явно (data-section) для
 * страниц, адрес которых маршрутам не известен; в dev раздел можно задать и /?section=….
 */
function routeFor(href: string, fallbackSection: string): Route {
  const url = new URL(href);
  if (import.meta.env.DEV) {
    const forced = url.searchParams.get('section');
    if (forced) return { kind: 'feed', section: forced };
  }
  return parseRoute(url) ?? { kind: 'feed', section: fallbackSection };
}

export default function App({ fallbackSection }: { fallbackSection: string }) {
  const href = useLocationHref();
  const route = useMemo(() => routeFor(href, fallbackSection), [href, fallbackSection]);
  useScrollRestoration(href);

  // одиночная публикация — следующий этап; пока её открывает сайт (остров туда не переходит)
  if (route.kind === 'post') return null;
  // новый раздел — новая лента (у каждой свой кэш RTK Query, «Назад» вернёт без загрузки)
  return <Feed key={route.section} section={route.section} />;
}
