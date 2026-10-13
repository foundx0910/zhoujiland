/* ------------------------------------------------------------------ *
 * 微型路由器 + 应用装配（Express / Workers 共用同一套 handler）          *
 * ------------------------------------------------------------------ */

import { ApiError, createContext } from './http.js';
import { resolveActor } from './auth.js';
import * as store from './store.js';
import { registerRoutes } from './routes/index.js';

function patternToRegex(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((seg) => {
      if (!seg) return '';
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}/?$`), keys };
}

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const { regex, keys } = patternToRegex(pattern);
    routes.push({ method, regex, keys, handler, pattern });
  };
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    patch: (p, h) => add('PATCH', p, h),
    del: (p, h) => add('DELETE', p, h),
    match(method, path) {
      // HEAD 与 GET 走同一套路由（否则 HEAD /uploads/x 会 404）
      const want = method === 'HEAD' ? 'GET' : method;
      for (const route of routes) {
        if (route.method !== want) continue;
        const m = route.regex.exec(path);
        if (!m) continue;
        const params = {};
        route.keys.forEach((k, i) => {
          try {
            params[k] = decodeURIComponent(m[i + 1]);
          } catch {
            params[k] = m[i + 1];
          }
        });
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}

export function createApp({ db, uploads, schemaSql, log = () => {} }) {
  const router = createRouter();
  registerRoutes(router);

  return {
    router,
    /** 处理一次请求；返回填好响应的 ctx */
    async handle({ method, url, headers, bodyBytes, env }) {
      const ctx = createContext({ method, url, headers, bodyBytes, env });
      ctx.db = db;
      ctx.uploads = uploads;
      ctx.log = log;
      try {
        await store.ensureReady(db, { schemaSql, log });
        await resolveActor(ctx);
        const matched = router.match(ctx.method, ctx.path);
        if (!matched) {
          if (ctx.path.startsWith('/api/')) ctx.json(404, { error: '这个接口不在这儿' });
          else ctx.text(404, 'Not Found');
          return ctx;
        }
        ctx.params = matched.params;
        await matched.handler(ctx);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 500;
        if (status >= 500) console.error('[forum] 服务器错误:', err);
        const payload = { error: status >= 500 ? '服务端打了个盹，稍后再试试' : err.message };
        // 排障用：wrangler.toml 里设 FORUM_DEBUG = "1" 时，把真实异常信息一并返回
        if (status >= 500 && String(ctx.env?.FORUM_DEBUG ?? '') === '1') {
          payload.detail = String(err?.message ?? err).slice(0, 300);
        }
        ctx.json(status, payload);
      }
      return ctx;
    },
  };
}
