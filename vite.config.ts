import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Пока ручки /api/v1/feed/ нет на сервере: DEV_FIXTURES=1 в .env.local — лента из
 * dev-fixtures/feed.json (в git не попадает) страницами по 7, а лайк, удаление, скрытие и
 * жалоба отвечают заглушками — на сервер ничего не уходит.
 */
function feedFixture(): Plugin {
  const PAGE = 7;
  const liked = new Map<number, boolean>();
  const json = (res: import('node:http').ServerResponse, data: unknown) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(data));
  };
  return {
    name: 'posts-fixture',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '', 'http://x');
        const path = url.pathname;
        if (path === '/api/v1/feed/') {
          const file = 'dev-fixtures/feed.json';
          const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { posts: [], blocks: [], viewer: {} };
          const before = Number(url.searchParams.get('before') || 0);
          const start = before ? data.posts.findIndex((p: { id: number }) => p.id === before) + 1 : 0;
          const posts = data.posts.slice(start, start + PAGE);
          // задержка — чтобы был виден индикатор загрузки
          setTimeout(
            () =>
              json(res, {
                posts,
                more: start + PAGE < data.posts.length,
                viewer: data.viewer,
                ...(before ? {} : { blocks: data.blocks }),
              }),
            before ? 600 : 200,
          );
          return;
        }
        let m = /^\/likes\/post\/(\d+)\/$/.exec(path);
        if (m && req.method === 'POST') {
          const id = Number(m[1]);
          liked.set(id, !liked.get(id));
          return json(res, { code: 200, set: liked.get(id), count: liked.get(id) ? 1 : 0 });
        }
        m = /^\/post\/(\d+)\/$/.exec(path);
        if (m && req.method === 'POST') return json(res, { code: 200, msg: 'ok' });
        m = /^\/api\/v1\/posts\/(\d+)\/$/.exec(path);
        if (m && req.method === 'PATCH') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => json(res, { status: JSON.parse(body).status === 'hidden' ? 'hidden' : 'published' }));
          return;
        }
        if (path === '/api/v1/support/task/session/' && req.method === 'POST') return json(res, { id: 1 });
        next();
      });
    },
  };
}

// В dev-режиме API, медиа, статика сайта и WebSocket проксируются на бэкенд, чтобы cookie
// работали как same-origin. Для работы с боевым сервером без логина можно задать DEV_COOKIE
// (строка Cookie из браузера) в .env.local — прокси подставит её сам, а заодно X-CSRFToken,
// Origin и Referer для Django CSRF.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = (env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const devCookie = env.DEV_COOKIE || '';
  const csrf = /(?:^|;\s*)csrftoken=([^;]+)/.exec(devCookie)?.[1];

  const proxy = (ws = false): ProxyOptions => ({
    target: ws ? backend.replace(/^http/, 'ws') : backend,
    ws,
    changeOrigin: true,
    secure: true,
    configure: (p) => {
      if (!devCookie) return;
      const inject = (req: { setHeader: (k: string, v: string) => void }) => {
        req.setHeader('cookie', devCookie);
        req.setHeader('origin', backend);
        req.setHeader('referer', backend + '/');
        // токен из DEV_COOKIE: своя кука csrftoken у браузера на dev-хосте с ней не совпадёт
        if (csrf) req.setHeader('x-csrftoken', csrf);
      };
      p.on('proxyReq', (req) => inject(req));
      p.on('proxyReqWs', (req) => inject(req));
      // сессией управляет DEV_COOKIE — куки бэкенда в браузер не пропускаем
      p.on('proxyRes', (res) => {
        delete res.headers['set-cookie'];
      });
    },
  });

  return {
    // Статику отдаёт Django с /assets/posts/
    base: command === 'build' ? env.VITE_ASSETS_BASE || '/assets/posts/' : '/',
    plugins: [react(), ...(command === 'serve' && env.DEV_FIXTURES ? [feedFixture()] : [])],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        // точка входа без index.html: её подключает шаблон Django
        input: 'src/main.tsx',
        output: {
          // один файл скрипта и один стилей со статическими именами — прописаны в шаблоне (с ?v=)
          entryFileNames: 'posts.js',
          inlineDynamicImports: true,
          assetFileNames: (info) =>
            info.names?.some((n) => n.endsWith('.css')) ? 'posts.css' : 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      port: 5181,
      proxy: {
        '/api': proxy(),
        '/media': proxy(),
        // статика сайта: заглушка аватара и т. п.
        '/assets': proxy(),
        '/likes': proxy(),
        // старые ручки поста (удаление): POST /post/<id>/
        '^/post/\d+/$': proxy(),
        '/ws': proxy(true),
      },
    },
  };
});
